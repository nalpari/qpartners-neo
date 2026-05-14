import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { COOKIE_NAME, getUserFromRequest } from "@/lib/jwt";
import { qspLogoutResponseSchema } from "@/lib/schemas/auth";

// POST /api/auth/logout — QSP 로그아웃 호출 + 인증 쿠키 삭제
//
// 흐름:
//   1) JWT 쿠키에서 loginId/userTp 추출 (없거나 만료면 QSP 호출 스킵 — 멱등 처리)
//   2) QSP POST /api/user/logout (actLog="LOGOUT") 호출 — qp_interface_log 자동 기록
//   3) QSP 응답 성공/실패와 무관하게 클라이언트 세션 쿠키는 항상 삭제 (fail-open)
//      ※ QSP 가 502/timeout 이어도 사용자 입장에서는 로그아웃이 반드시 완료되어야 함.
//        QSP 측 로그 누락은 fetchWithLog 에러 라인으로 운영자가 별도 추적.
export async function POST(request: NextRequest) {
  try {
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
            body: JSON.stringify({
              loginId: user.userId,
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
            userId: maskEmail(user.userId),
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

    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("[POST /api/auth/logout]", error);
    return NextResponse.json(
      { error: "ログアウト処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
