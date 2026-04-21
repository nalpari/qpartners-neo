import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const DECRYPT_WINDOW_MS = 60 * 1000;
/** QSP 정상 호출 초당 1회 상한 + 여유 */
const DECRYPT_LIMIT_WITH_IP = 60;
/** IP 헤더 부재 시 공용 버킷은 더 엄격히 */
const DECRYPT_LIMIT_NO_IP = 20;

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
//   3. QSP가 복원된 userId로 QSP Login API(loginKey=jpcellautologin!!) 호출 → 세션 수립 후 대상 시스템 진입
//
// 자정 경계(KST): 당일 키 복호화 실패 시 전일 키로 1회 재시도. 두 키 모두 실패 시 500.
export async function GET(request: NextRequest) {
  try {
    // 1. Rate limit: IP 기반 (PUBLIC 엔드포인트 — 브루트포스·패딩 오라클 1차 방어)
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    const ipKey = ip ?? "auto-login-decrypt-no-ip";
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
    } catch (error) {
      console.error("[GET /api/auth/auto-login/decrypt] 복호화 실패:", error);
      return NextResponse.json(
        {
          data: { userId: null },
          resultCode: 500,
          resultMessage: "decrypt failed",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[GET /api/auth/auto-login/decrypt]", error);
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
