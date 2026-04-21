import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const DECRYPT_WINDOW_MS = 60 * 1000;
/** QSP 정상 호출 초당 1회 상한 + 여유 */
const DECRYPT_LIMIT_WITH_IP = 60;
/** IP 헤더 부재 시 공용 버킷은 더 엄격히 */
const DECRYPT_LIMIT_NO_IP = 20;

// GET /api/auth/auto-login/decrypt?autoLoginParam1={URL_ENCODED_CIPHERTEXT}
//
// 가이드 4.2 `autoLoginDecryptData` 역할 — 외부 시스템(EOS/Q.Order, Q.Musubi)이
// 수신한 autoLoginParam1을 복호화하기 위해 호출. 성공 시 복호화된 userId(평문 로그인 ID)를 반환한다.
//
// 흐름:
//   1. Q.Partners가 자체 AES256로 userId 암호화 → URL 이동
//   2. 외부 사이트가 수신한 autoLoginParam1(암호문)을 decodeURIComponent 후 본 API 호출
//   3. 본 API가 AES256 복호화 → 평문 userId 반환
//   4. 외부 사이트가 해당 userId로 Q.Partners Login API 호출(loginKey=jpcellautologin!! 사용)
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
