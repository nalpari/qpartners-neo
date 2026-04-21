import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { ConfigError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

const DECRYPT_WINDOW_MS = 60 * 1000;
/** QSP 정상 호출 초당 1회 상한 + 여유 */
const DECRYPT_LIMIT_WITH_IP = 60;
/** IP 헤더 부재 시 공용 버킷은 더 엄격히 */
const DECRYPT_LIMIT_NO_IP = 20;
/** 인증 실패 요청은 별도 버킷에서 더 엄격하게 제한 (brute-force 방어) */
const DECRYPT_LIMIT_AUTH_FAIL = 10;

/** QSP 역호출 M2M 공유 비밀 헤더 */
const M2M_SECRET_HEADER = "x-qsp-auth";

/**
 * 호출자(QSP) 검증 결과.
 * - `authorized` : shared secret 일치 또는 env 미설정(dev 점진 배포)
 * - `unauthorized`: 헤더 누락 / 불일치
 * env 미설정 시 프로덕션이면 ConfigError throw (배포 누락 방지).
 */
type CallerVerdict = "authorized" | "unauthorized";

function verifyCallerSecret(request: NextRequest): CallerVerdict {
  const expected = process.env.AUTO_LOGIN_DECRYPT_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      throw new ConfigError(
        "AUTO_LOGIN_DECRYPT_SECRET 환경변수가 설정되지 않았습니다 (프로덕션 필수)",
      );
    }
    console.warn(
      "[GET /api/auth/auto-login/decrypt] AUTO_LOGIN_DECRYPT_SECRET 미설정 — 호출자 검증 skip (dev 전용)",
    );
    return "authorized";
  }
  const provided = request.headers.get(M2M_SECRET_HEADER);
  if (!provided) return "unauthorized";
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) return "unauthorized";
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
// 보호 순서: 호출자 검증(시크릿) → rate-limit → 파라미터 검증 → 복호화.
// 인증 실패 요청은 별도 엄격 버킷(`auth-fail:{ip}`)에 기록하여 정상 버킷(`ok:{ip}`) 선점을 방지.
//
// 자정 경계(KST): 당일 키 복호화 실패 시 전일 키로 1회 재시도. 두 키 모두 실패 시 500.
export async function GET(request: NextRequest) {
  try {
    // 1. 호출자 검증 (rate-limit 앞 — 미인증 공격자의 정상 버킷 선점 방지)
    const verdict = verifyCallerSecret(request);
    const ip = extractIp(request);
    const ipKey = ip ?? "auto-login-decrypt-no-ip";

    if (verdict === "unauthorized") {
      // 인증 실패 전용 버킷 — brute-force 방어, 한도 10/min
      if (
        !checkRateLimit(
          `auto-login-decrypt-auth-fail:${ipKey}`,
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

    // 2. 정상 호출자 rate-limit (QSP 정상 호출 초당 1회 상한 + 여유)
    const limit = ip ? DECRYPT_LIMIT_WITH_IP : DECRYPT_LIMIT_NO_IP;
    if (!checkRateLimit(`auto-login-decrypt:${ipKey}`, limit, DECRYPT_WINDOW_MS)) {
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 429,
          resultMessage: "too many requests",
        },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn("[GET /api/auth/auto-login/decrypt] IP 헤더 없음 — 제한적 rate limit 적용");
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
        cipherPrefix: autoLoginParam1.slice(0, 8),
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
