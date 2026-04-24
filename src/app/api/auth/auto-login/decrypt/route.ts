import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { ConfigError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

const DECRYPT_WINDOW_MS = 60 * 1000;
/** QSP 정상 호출 초당 1회 상한 + 여유 */
const DECRYPT_LIMIT_WITH_IP = 60;
/** 인증 실패 요청은 별도 버킷에서 더 엄격하게 제한 (brute-force 방어) */
const DECRYPT_LIMIT_AUTH_FAIL = 10;

/** QSP 역호출 M2M 공유 비밀 헤더 */
const M2M_SECRET_HEADER = "x-qsp-auth";

/**
 * 호출자(QSP) 검증 결과.
 * - `authorized` : shared secret 일치 또는 명시적 dev 점진 배포 모드
 * - `unauthorized`: 헤더 누락 / 불일치
 *
 * 시크릿 필수 여부 판정:
 *   1. `AUTO_LOGIN_REQUIRE_CALLER_SECRET=false` 이면 강제 비활성 (로컬 dev 전용)
 *   2. 그 외에는 모든 환경(dev/stg/prd)에서 시크릿 필수 — 미설정 시 ConfigError throw
 *
 * 배경: `NODE_ENV` 기반 분기는 staging이 production 빌드 아닌 경우 decrypt API가
 * 무인증으로 열려 cipher↔userId Oracle이 되는 문제가 있음. 명시적 opt-out 플래그로 강제화.
 */
type CallerVerdict = "authorized" | "unauthorized";

function isCallerSecretRequired(): boolean {
  // 기본값: true (모든 환경에서 시크릿 필수). "false"/"0" 만 강제 비활성으로 인정.
  const raw = process.env.AUTO_LOGIN_REQUIRE_CALLER_SECRET?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}

function verifyCallerSecret(request: NextRequest): CallerVerdict {
  const expected = process.env.AUTO_LOGIN_DECRYPT_SECRET;
  if (!expected) {
    if (isCallerSecretRequired()) {
      throw new ConfigError(
        "AUTO_LOGIN_DECRYPT_SECRET 환경변수가 설정되지 않았습니다 " +
          "(기본 필수 — 로컬 dev 에서만 AUTO_LOGIN_REQUIRE_CALLER_SECRET=false 로 비활성화 가능)",
      );
    }
    console.warn(
      "[GET /api/auth/auto-login/decrypt] AUTO_LOGIN_DECRYPT_SECRET 미설정 — 호출자 검증 skip (AUTO_LOGIN_REQUIRE_CALLER_SECRET=false, dev 전용)",
    );
    return "authorized";
  }
  const provided = request.headers.get(M2M_SECRET_HEADER);
  if (!provided) return "unauthorized";
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    // timing leak 방지: 길이가 달라도 dummy 비교 수행 후 결과 무시
    const dummy = Buffer.alloc(expectedBuf.length);
    timingSafeEqual(expectedBuf, dummy);
    return "unauthorized";
  }
  return timingSafeEqual(expectedBuf, providedBuf) ? "authorized" : "unauthorized";
}

function extractIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

// GET /api/auth/auto-login/decrypt?autoLoginParam1={URL-encoded cipher}
//
// 호출자: QSP (Q.Order/Q.Musubi 자동로그인 처리 도중 Q.Partners를 역호출).
// 대상: Q.Partners encryptSelf가 생성한 cipher — 즉 qOrder/qMusubi 경로 전용.
// hanasys 경로는 QSP 내부에서 cipher 생성·복호화 모두 처리되므로 이 엔드포인트로 오지 않는다.
//
// 응답 포맷(M2M 인터페이스): QSP가이드 4.2 autoLoginDecryptData 계약에 맞춘
// { data: { userId }, resultCode, resultMessage } 구조를 따른다. 유저 대면 아님.
//
// 흐름 (qOrder/qMusubi):
//   1. Q.Partners encrypt → `{qsp}/eos/login/autoLogin?autoLoginParam1=<cipher>` 로 브라우저 이동
//   2. QSP가 cipher 수신 후 본 엔드포인트 역호출 → userId 복원
//   3. QSP가 복원된 userId로 QSP 자체 로그인 플로우 수행 → 세션 수립 후 대상 시스템 진입
//
// 보호 순서: IP 식별(fail-closed) → 호출자 검증(시크릿) → rate-limit → 파라미터 검증 → 복호화.
// 인증 실패 요청은 별도 엄격 버킷(`auth-fail:{ip}`)에 기록하여 정상 버킷(`ok:{ip}`) 선점을 방지.
//
// IP 식별 불가 시 즉시 403 (fail-closed): `.claude/rules/api.md` 규칙에 따라 shared bucket 금지.
// M2M 엔드포인트이므로 QSP 서버는 항상 IP를 가지며, IP 없는 요청은 비정상으로 간주.
// inbound auto-login route와 동일 정책.
//
// 자정 경계(KST): 당일 키 복호화 실패 시 전일 키로 1회 재시도. 두 키 모두 실패 시 500.
export async function GET(request: NextRequest) {
  try {
    // 1. IP 식별 — 불가 시 즉시 거부 (fail-closed, shared bucket 금지 원칙)
    const ip = extractIp(request);
    if (!ip) {
      console.warn("[GET /api/auth/auto-login/decrypt] IP 헤더 없음 — 요청 거부 (fail-closed)");
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 403,
          resultMessage: "ip header required",
        },
        { status: 403 },
      );
    }

    // 2. 호출자 검증 (rate-limit 앞 — 미인증 공격자의 정상 버킷 선점 방지)
    const verdict = verifyCallerSecret(request);

    if (verdict === "unauthorized") {
      // 인증 실패 전용 버킷 — brute-force 방어, 한도 10/min
      if (
        !checkRateLimit(
          `auto-login-decrypt-auth-fail:${ip}`,
          DECRYPT_LIMIT_AUTH_FAIL,
          DECRYPT_WINDOW_MS,
        )
      ) {
        return NextResponse.json(
          {
            data: { userId: null },
            resultCode: 429,
            resultMessage: "too many requests",
          },
          { status: 429 },
        );
      }
      console.warn(
        "[GET /api/auth/auto-login/decrypt] 호출자 검증 실패 — shared secret 불일치",
      );
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 401,
          resultMessage: "caller verification failed",
        },
        { status: 401 },
      );
    }

    // 3. 정상 호출자 rate-limit (QSP 정상 호출 초당 1회 상한 + 여유)
    if (!checkRateLimit(`auto-login-decrypt:${ip}`, DECRYPT_LIMIT_WITH_IP, DECRYPT_WINDOW_MS)) {
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 429,
          resultMessage: "too many requests",
        },
        { status: 429 },
      );
    }

    const autoLoginParam1 = request.nextUrl.searchParams.get("autoLoginParam1");

    if (!autoLoginParam1) {
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 400,
          resultMessage: "autoLoginParam1 is required",
        },
        { status: 400 },
      );
    }

    try {
      const decryptedUserId = decryptAutoLogin(autoLoginParam1);
      return NextResponse.json({
        data: { userId: decryptedUserId },
        resultCode: 200,
        resultMessage: "decrypt success",
      });
    } catch (error: unknown) {
      console.error("[GET /api/auth/auto-login/decrypt] 복호화 실패:", {
        // cipher 평문 prefix 로깅 금지 — 길이만 기록 (CBC 첫 블록 노출 방어)
        cipherLength: autoLoginParam1.length,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 500,
          resultMessage: "decrypt failed",
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      console.error(
        "[GET /api/auth/auto-login/decrypt] 설정 에러:",
        error.message,
      );
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 500,
          resultMessage: "server configuration error",
        },
        { status: 500 },
      );
    }
    console.error("[GET /api/auth/auto-login/decrypt] 예상치 못한 에러:", {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        data: { userId: null },
        resultCode: 500,
        resultMessage: "decrypt failed",
      },
      { status: 500 },
    );
  }
}
