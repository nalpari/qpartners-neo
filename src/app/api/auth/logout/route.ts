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
 * same-origin 검증 — 강제 로그아웃 CSRF 심층 방어.
 *
 * SameSite=Lax 쿠키로 1차 보호되지만, 일부 우회 케이스(서브도메인 takeover, embed iframe)
 * 에 대비해 Origin / Referer 헤더가 자신의 origin 과 일치하는지 추가 검증한다.
 * 둘 다 없는 환경(엄격한 프록시/일부 모바일 in-app browser)에서는 통과(fail-open) —
 * 실질 피해는 세션 종료뿐이라 정상 사용자 차단을 막는 쪽을 우선한다.
 */
function isSameOrigin(request: NextRequest): boolean {
  const expected = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected;
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
      return NextResponse.json(
        { error: "リクエスト元が無効です" },
        { status: 403 },
      );
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
      data: { message: "로그아웃 되었습니다" },
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
