import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import { COOKIE_NAME, getUserFromRequest } from "@/lib/jwt";
import { qspLogoutResponseSchema } from "@/lib/schemas/auth";

// 쿠키 삭제 옵션 — 정상/에러 경로에서 항상 동일하게 만료시켜 silent session leak 방지.
const COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

/**
 * same-origin 검증 — 보조적 심층 방어 (SameSite=Lax 가 주력).
 *
 * 본 라우트의 CSRF 방어 주체는 인증 쿠키의 `sameSite: "lax"` 속성이다.
 * 본 함수는 일부 우회 케이스(서브도메인 takeover, embed iframe 등)에 대비한
 * 2차 검증으로 Origin / Referer 헤더의 host 가 자신의 host 와 일치하는지 확인한다.
 *
 * 호스트만 비교하는 이유: nginx 등 TLS termination 프록시 뒤에서 동작할 때
 * 브라우저 Origin 은 `https://...` 이지만 Next.js 컨테이너가 받는 connection 은 HTTP 라
 * `request.nextUrl.origin` 이 `http://...` 로 평가된다. 프로토콜까지 비교하면 정상 사용자가
 * 항상 차단된다. CSRF 방어 의도(같은 사이트인지)에는 host 일치만으로 충분하다.
 *
 * X-Forwarded-Host > Host > nextUrl.host 순으로 expected host 를 결정 — 프록시 헤더가 있는
 * 환경(개발/운영)과 없는 환경(로컬) 양쪽 모두 동작.
 *
 * Origin / Referer 둘 다 없는 환경(엄격한 프록시·일부 모바일 in-app browser)에서는
 * 통과(fail-open) — 1차 방어(SameSite=Lax) 가 이미 동작하고 실질 피해는 세션 종료뿐이라
 * 정상 사용자 차단을 막는 쪽을 우선한다.
 */
function isSameOrigin(request: NextRequest): boolean {
  const expectedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === expectedHost;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === expectedHost;
    } catch {
      return false;
    }
  }
  return true;
}

// POST /api/auth/logout — QSP 로그아웃 호출 + 인증 쿠키 삭제
//
// 흐름:
//   1) Origin/Referer 검증 (CSRF 방어, 둘 다 없으면 통과)
//   2) JWT 쿠키에서 loginId/userTp 추출 (없거나 만료면 QSP 호출 스킵 — 멱등 처리)
//   3) QSP POST /api/user/logout (actLog="LOGOUT") 호출 — qp_interface_log 자동 기록
//   4) QSP 응답 성공/실패와 무관하게 클라이언트 세션 쿠키는 항상 삭제 (fail-open)
//      ※ QSP 가 502/timeout 이어도 사용자 입장에서는 로그아웃이 반드시 완료되어야 함.
//        QSP 측 로그 누락은 fetchWithLog 에러 라인으로 운영자가 별도 추적.
//      ※ 서버 예외(500) catch 경로에서도 동일 옵션으로 쿠키 삭제 — silent session leak 차단.
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      console.warn("[POST /api/auth/logout] same-origin 검증 실패 — 차단");
      // 403 응답에도 쿠키 삭제 — fail-open 정책과 일관. CSRF 차단되더라도 정상 사용자
      // 입장에서는 로그아웃이 끝나야 하며, performLogout 이 /login 으로 이동한 뒤
      // JWT 쿠키가 살아남는 silent session leak 을 차단한다.
      const errResponse = NextResponse.json(
        { error: "リクエスト元が無効です" },
        { status: 403 },
      );
      errResponse.cookies.set(COOKIE_NAME, "", COOKIE_CLEAR_OPTIONS);
      return errResponse;
    }

    const user = await getUserFromRequest(request);

    if (user) {
      try {
        const qspResponse = await fetchWithLog(
          QSP_API.logout,
          {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
            // userTp 포함 — login API 와 동일하게 전송. 동일 loginId 가 여러 userTp 에
            // 존재 가능(`.claude/rules/api.md` "동일 이메일이 여러 userType에 존재 가능")
            // 하므로 QSP 측이 정확한 행을 식별하도록 명시. 사양서에 `pwd` 불요만 명시되어
            // userTp 여부 불분명 → login 과 일관성 유지하는 보수적 선택.
            body: JSON.stringify({
              loginId: user.userId,
              userTp: user.userTp,
              accsSiteCd: "QPARTNERS",
              actLog: "LOGOUT",
              requestId: crypto.randomUUID(),
            }),
          },
          {
            system: "QSP",
            direction: "OUTBOUND",
            apiName: "logout",
            callerRoute: "[POST /api/auth/logout]",
            // STORE/SEKO loginId 는 이메일 형식 아님 → maskUserId 로 통일 마스킹.
            userId: maskUserId(user.userId),
            userType: user.userTp,
          },
        );

        if (qspResponse.ok) {
          // 스키마 검증 — 실패해도 본 흐름은 진행 (로깅만)
          try {
            const qspBody: unknown = await qspResponse.json();
            const parsed = qspLogoutResponseSchema.safeParse(qspBody);
            if (!parsed.success) {
              console.warn(
                "[POST /api/auth/logout] QSP 응답 스키마 불일치:",
                parsed.error.issues,
              );
            } else if (parsed.data.result.resultCode !== "S") {
              console.warn("[POST /api/auth/logout] QSP 로그아웃 실패 응답:", {
                code: parsed.data.result.code,
                resultCode: parsed.data.result.resultCode,
              });
            }
          } catch (error) {
            console.warn(
              "[POST /api/auth/logout] QSP 응답 JSON 파싱 실패:",
              error,
            );
          }
        } else {
          console.warn(
            "[POST /api/auth/logout] QSP 비정상 응답:",
            qspResponse.status,
          );
        }
      } catch (error) {
        // 네트워크/타임아웃 — 쿠키 삭제는 강행
        console.warn("[POST /api/auth/logout] QSP API 호출 실패:", error);
      }
    }

    const response = NextResponse.json({
      data: { message: "ログアウトが完了しました" },
    });
    response.cookies.set(COOKIE_NAME, "", COOKIE_CLEAR_OPTIONS);
    return response;
  } catch (error) {
    console.error("[POST /api/auth/logout]", error);
    // fail-open: 서버 예외 발생 시에도 클라이언트 세션 쿠키는 반드시 삭제하여
    // 프론트(performLogout) 가 /login 으로 리다이렉트한 뒤 JWT 가 살아남는 silent leak 차단.
    const errResponse = NextResponse.json(
      { error: "ログアウト処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
    errResponse.cookies.set(COOKIE_NAME, "", COOKIE_CLEAR_OPTIONS);
    return errResponse;
  }
}
