import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SITE_URL } from "@/lib/config";
import { ConfigError } from "@/lib/errors";
import { clearSessionCookie, getUserFromRequest } from "@/lib/jwt";
import { sekoAutoLogin } from "@/lib/seko-connector";
import {
  SEKO_AUTOLOGIN_RESULT_PATH,
  type SekoAutoLoginFailureReason,
} from "@/lib/seko-autologin-result";

/**
 * GET /api/auth/seko/autologin — 시공점(SEKO) → AS-IS Q.Partners 자동로그인 이동.
 *
 * TO-BE 에 로그인한 시공점 회원을 AS-IS 로 **로그인된 채** 내보낸다.
 * 커넥터(No.1)로 일회용 `autologinUrl` 을 받아 그리로 302 한다.
 *
 * **화면(브라우저) 진입 전용 라우트다.** 응답이 리다이렉트이므로 fetch 로 호출하면 의미가 없고,
 * 무엇보다 발급 URL 이 **1회·1분** 유효라 미리 호출해 두면 그대로 소진된다. 호출부는 사용자가
 * 클릭한 시점에 새 창으로 이 라우트에 진입해야 한다.
 *
 * **실패는 전부 결과 페이지로 돌려보낸다** — JSON 을 반환하지 않는다. 이 라우트는 사용자가
 * 새 창으로 들어오는 경로라 JSON 을 던지면 빈 탭에 원문이 뜨고, 부모 탭은 실패를 알 방법이
 * 없어 대기 타이머가 그대로 발화해 사용자를 AS-IS 로 보내버린다(비로그인 착지).
 * 결과 페이지가 `postMessage` 로 부모에게 사유를 넘긴다 — `lib/seko-autologin-result.ts` 참조.
 *
 * 그래서 이 경로는 `middleware.ts` 의 `PUBLIC_PATHS` 에 등록돼 있다. 미들웨어가 인증 실패를
 * 선점하면 그 JSON 이 곧 위 상황이 되기 때문이며, 인가는 아래 4단 가드가 쿠키를 직접
 * 재검증해 수행한다(헤더 주입값에 의존하지 않는다).
 *
 * 착지는 현재 **AS-IS 사이트 루트로 고정**이다. 요청 파라미터·URL 쿼리 어느 쪽으로도 화면을
 * 지정할 수 없음을 preview 에서 확인했다(ENDO 질의 중 — Redmine #1750 note-23·25 관련).
 * 지정 수단이 생기면 커넥터에 착지 경로 인자를 더하는 것으로 끝난다.
 */

const LOG_TAG = "[GET /api/auth/seko/autologin]";

/**
 * 실패 결과 페이지로 리다이렉트.
 *
 * base 를 `SITE_URL` 로 고정한다 — `request.nextUrl.origin` 은 Host 헤더 파생이라
 * 헤더 조작이 그대로 Location 에 반영된다(auto-login/inbound 와 동일 관례).
 *
 * 성공 경로와 같은 `no-store` 를 건다. 실패 사유는 그 시점의 세션 상태이므로 중간 캐시가
 * 들고 있으면 이후 재시도에 낡은 사유가 재생된다 — 두 경로의 캐시 정책이 갈릴 이유가 없다.
 */
function failureRedirect(reason: SekoAutoLoginFailureReason): NextResponse {
  const url = new URL(SEKO_AUTOLOGIN_RESULT_PATH, SITE_URL);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      // 쿠키 없음·만료·서명 불일치. 부모 탭도 로그인 화면으로 보내야 하므로 session 으로 알린다.
      // 쿠키도 함께 만료시킨다 — `session` 사유의 불변식이 "서버가 인증 쿠키를 이미 지웠다"
      // 이기도 하고, `verifyToken` 이 **스키마 불일치**로 null 을 돌려주는 경우(서명·만료는
      // 유효)에는 무효 쿠키가 그대로 남아 다음 요청이 같은 자리에서 반복 실패한다.
      return clearSessionCookie(failureRedirect("session"));
    }
    // 시공점 회원 전용. 다른 유형에는 AS-IS 계정 자체가 없다.
    if (user.userTp !== "SEKO") {
      return failureRedirect("not_seko");
    }
    if (!user.twoFactorVerified) {
      return failureRedirect("two_factor");
    }
    if (!user.sekoToken) {
      console.error(`${LOG_TAG} SEKO 세션 토큰 없음 — 재로그인 필요`);
      return clearSessionCookie(failureRedirect("session"));
    }

    const result = await sekoAutoLogin(user.userId, user.sekoToken, LOG_TAG);
    if (!result.ok) {
      // Bearer 만료(401)는 쿠키를 만료시켜 재로그인으로 유도한다. 쿠키를 남기면 로컬 JWT 는
      // 유효해 middleware 가 통과시키고 SEKO 호출만 반복 401 이 되어 세션이 고착된다.
      if (result.error.status === 401) {
        return clearSessionCookie(failureRedirect("session"));
      }
      return failureRedirect("failed");
    }

    // 발급 URL 은 1회·1분 유효 — 중간 캐시가 들고 있으면 재방문 시 만료 링크를 재사용하게 된다.
    return NextResponse.redirect(result.autologinUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 500 으로 접으면 운영자가 env 누락을 코드 버그와 구분할 수 없어 별도 로그를 남긴다.
    if (error instanceof ConfigError) {
      console.error(
        `${LOG_TAG} 설정 에러:`,
        error.name,
        "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요",
      );
    } else {
      console.error(LOG_TAG, error);
    }
    return failureRedirect("failed");
  }
}
