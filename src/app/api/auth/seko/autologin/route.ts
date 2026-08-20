import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { getUserFromRequest, sessionInvalidResponse } from "@/lib/jwt";
import { sekoAutoLogin } from "@/lib/seko-connector";

/**
 * GET /api/auth/seko/autologin — 시공점(SEKO) → AS-IS Q.Partners 자동로그인 이동.
 *
 * TO-BE 에 로그인한 시공점 회원을 AS-IS 로 **로그인된 채** 내보낸다.
 * 커넥터(No.1)로 일회용 `autologinUrl` 을 받아 그리로 302 한다.
 *
 * **화면(브라우저) 진입 전용 라우트다.** 응답이 리다이렉트이므로 fetch 로 호출하면 의미가 없고,
 * 무엇보다 발급 URL 이 **1회·1분** 유효라 미리 호출해 두면 그대로 소진된다. 호출부는 사용자가
 * 클릭한 시점에 `window.location` 으로 이 라우트에 진입해야 한다.
 *
 * 착지는 현재 **AS-IS 사이트 루트로 고정**이다. 요청 파라미터·URL 쿼리 어느 쪽으로도 화면을
 * 지정할 수 없음을 preview 에서 확인했다(ENDO 질의 중 — Redmine #1750 note-23·25 관련).
 * 지정 수단이 생기면 커넥터에 착지 경로 인자를 더하는 것으로 끝난다.
 */
export async function GET(request: NextRequest) {
  const mypageUrl = new URL("/mypage", request.nextUrl.origin);

  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
    }
    // 시공점 회원 전용. 다른 유형에는 AS-IS 계정 자체가 없다.
    if (user.userTp !== "SEKO") {
      return NextResponse.json(
        { error: "施工店会員のみ利用可能です" },
        { status: 403 },
      );
    }
    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }
    if (!user.sekoToken) {
      console.error("[GET /api/auth/seko/autologin] SEKO 세션 토큰 없음 — 재로그인 필요");
      return sessionInvalidResponse("セッションが無効です。再度ログインしてください");
    }

    const result = await sekoAutoLogin(
      user.userId,
      user.sekoToken,
      "[GET /api/auth/seko/autologin]",
    );
    if (!result.ok) {
      // Bearer 만료(401)는 쿠키를 만료시켜 재로그인으로 유도한다. 쿠키를 남기면 로컬 JWT 는
      // 유효해 middleware 가 통과시키고 SEKO 호출만 반복 401 이 되어 세션이 고착된다.
      if (result.error.status === 401) {
        return sessionInvalidResponse(result.error.error);
      }
      // 그 외 실패는 화면 진입이므로 JSON 을 던지지 않고 마이페이지로 돌려보낸다 —
      // 브라우저 주소창에 원문 JSON 이 노출되면 사용자가 복구 경로를 찾지 못한다.
      mypageUrl.searchParams.set("error", "seko_autologin_failed");
      return NextResponse.redirect(mypageUrl);
    }

    // 발급 URL 은 1회·1분 유효 — 중간 캐시가 들고 있으면 재방문 시 만료 링크를 재사용하게 된다.
    return NextResponse.redirect(result.autologinUrl, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 500 으로 접으면 운영자가 env 누락을 코드 버그와 구분할 수 없어 별도 로그를 남긴다.
    if (error instanceof ConfigError) {
      console.error(
        "[GET /api/auth/seko/autologin] 설정 에러:",
        error.name,
        "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요",
      );
    } else {
      console.error("[GET /api/auth/seko/autologin]", error);
    }
    mypageUrl.searchParams.set("error", "seko_autologin_failed");
    return NextResponse.redirect(mypageUrl);
  }
}
