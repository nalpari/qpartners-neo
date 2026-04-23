import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { COOKIE_NAME, getUserFromRequest } from "@/lib/jwt";
import { withdrawSchema } from "@/lib/schemas/mypage";
import { qspUpdateResponseSchema } from "@/lib/schemas/member";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { fetchQspUserDetail } from "@/lib/qsp-member";
import { checkRateLimit } from "@/lib/rate-limit";

// QSP 에러 message 로그 길이 제한 (내부 SQL 에러 / PII 간접 노출 방어)
const QSP_LOG_MSG_MAX_LEN = 200;

/** JWT 쿠키 삭제용 공통 옵션 — 로그인 경로(`/api/auth/login`)와 속성 일치 유지. */
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 0,
} as const;

/**
 * POST /api/mypage/withdraw — 회원탈퇴 (일반회원만)
 *
 * 처리 흐름:
 * 1. JWT 인증 + 2FA 확인
 * 2. userTp === GENERAL 강제 (그 외 403)
 * 3. Zod (withdrawSchema) 로 reason 검증 (<=500, QSP resignRemark 상한)
 * 4. QSP userDetail 로 현재 statCd 확인 (409 중복 체크 전용 — 기존 필수필드 수집 목적은 제거됨)
 * 5. QSP saveResignReq 호출 (사양서 No.8) — payload 는 {userTp, loginId, accsSiteCd, resignRemark} 4필드만
 *    - 이전 구현은 updateUserDtl+statCd:"R" 을 보냈으나 QSP 가 수용하지 않아 HTTP 500 "저장 중 오류..." 반환됨
 *      (2026-04-23 VPN 경유 QSP direct 호출로 실증).
 *    - saveResignReq 는 QSP 가 표준 응답 포맷 (resultCode=S/E) 로 회신함.
 * 6. 성공 시 JWT 쿠키 삭제로 즉시 로그아웃 유도
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }
    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }

    // 일반회원만 탈퇴 가능
    if (user.userTp !== "GENERAL") {
      return NextResponse.json(
        { error: "一般会員のみ退会が可能です" },
        { status: 403 },
      );
    }

    // GENERAL 은 userId === email. JWT 에 email 이 없는 비정상 세션은 거부 + 운영 알람.
    if (!user.email) {
      console.error("[POST /api/mypage/withdraw] JWT missing email", { userTp: user.userTp });
      return NextResponse.json(
        { error: "ユーザー情報に不備があります。再ログインしてください" },
        { status: 500 },
      );
    }

    // Rate Limit — 탈퇴는 불가역 작업이므로 JWT 탈취 후 반복호출 / QSP 부하유발 차단.
    //   IP(프록시 x-forwarded-for) 우선, 없으면 email 기반 fallback key 로 공용 버킷 전체 차단을 방지.
    //   기준: password-reset/request 와 동일 패턴이나 탈퇴 특성상 더 엄격(1시간 내 IP 5건 / email 3건).
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    const rateLimitKey = ip ?? `account:${user.email}`;
    if (!checkRateLimit(`withdraw:${rateLimitKey}`, ip ? 5 : 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn("[POST /api/mypage/withdraw] IP 헤더 없음 — email 기반 rate limit 적용");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/mypage/withdraw] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "無効なリクエストです" },
        { status: 400 },
      );
    }

    const result = withdrawSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: result.error.issues },
        { status: 400 },
      );
    }
    const { reason } = result.data;

    // 1. QSP userDetail 로 현재 statCd 확인 — 409(이미 탈퇴) 재현을 위한 사전 체크 전용.
    //    saveResignReq 는 자체적으로 "ユーザーの退会に失敗しました" 로 실패를 알리지만, 이미 탈퇴된 회원을 재호출하는
    //    케이스를 명시적으로 409 로 분기시키기 위해 선행 조회를 유지한다.
    //    GENERAL 회원은 QSP 내부 조회 키가 email (위 !user.email 체크로 null 제외).
    const detailResult = await fetchQspUserDetail(
      user.email,
      user.userTp,
      "[POST /api/mypage/withdraw]",
    );
    if (!detailResult.ok) {
      // QSP 내부 오류 메시지(SQL 등)가 클라이언트로 직접 전달되지 않도록 일반화된 문구로 대체.
      console.error("[POST /api/mypage/withdraw] QSP userDetail 조회 실패:", {
        status: detailResult.error.status,
        msg: detailResult.error.error,
      });
      return NextResponse.json(
        { error: "退会処理中にエラーが発生しました" },
        { status: detailResult.error.status },
      );
    }
    const current = detailResult.detail;

    // QSP statCd 가 null 이면 회원 상태 불명 — 탈퇴 가능 여부 판단 불가하므로 안전하게 502 로 중단.
    if (!current.statCd) {
      console.error("[POST /api/mypage/withdraw] QSP statCd null — 회원 상태 확인 불가");
      return NextResponse.json(
        { error: "退会処理に失敗しました" },
        { status: 502 },
      );
    }

    // 이미 탈퇴 처리된 회원은 멱등성 보장을 위해 409 (재실행 안전장치).
    if (current.statCd === "R") {
      // 이미 탈퇴된 계정의 JWT 는 즉시 무효화 — 쿠키 탈취로 세션이 만료될 때까지 유효하게 잔존하는 것을 차단.
      const resp = NextResponse.json(
        { error: "既に退会済みの会員です" },
        { status: 409 },
      );
      resp.cookies.set(COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
      return resp;
    }

    // 2. QSP saveResignReq 호출 — 탈퇴 전용 엔드포인트 (사양서 No.8).
    //    필수 파라미터 4개만 전송. 이전 구현의 updateUserDtl + statCd:"R" + 17필드 방식은
    //    QSP 가 수용하지 않아 HTTP 500 반환하므로 절대 복귀 금지.
    const qspPayload = {
      userTp: user.userTp,
      loginId: user.userId,
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
      resignRemark: reason,
    };

    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        QSP_API.saveResignReq,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify(qspPayload),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "saveResignReq",
          callerRoute: "[POST /api/mypage/withdraw]",
          userId: maskEmail(user.userId),
          userType: user.userTp,
        },
      );
    } catch (error) {
      console.error("[POST /api/mypage/withdraw] QSP 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[POST /api/mypage/withdraw] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error("[POST /api/mypage/withdraw] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspUpdateResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[POST /api/mypage/withdraw] QSP 응답 스키마 불일치:", parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    const { resultCode, resultMsg } = parsed.data.result;
    if (resultCode !== "S") {
      const truncatedMsg = (resultMsg ?? "").slice(0, QSP_LOG_MSG_MAX_LEN);
      console.error("[POST /api/mypage/withdraw] QSP 탈퇴 실패:", {
        userTp: user.userTp,
        resultCode,
        resultMsg: truncatedMsg,
      });

      // TOCTOU Race Condition 완화: 사전 체크(statCd !== "R") 와 saveResignReq 호출 사이에
      // 다른 경로(다른 탭/기기) 로 이미 탈퇴 처리가 완료되었을 가능성을 재확인.
      const recheck = await fetchQspUserDetail(
        user.email,
        user.userTp,
        "[POST /api/mypage/withdraw][recheck]",
      );

      // 분기 1: 재조회 성공 + statCd === "R" → 실제로는 탈퇴 완료 상태. 409 + 쿠키 삭제.
      if (recheck.ok && recheck.detail.statCd === "R") {
        const resp = NextResponse.json(
          { error: "既に退会済みの会員です" },
          { status: 409 },
        );
        resp.cookies.set(COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
        return resp;
      }

      // 분기 2: 재조회 성공 + statCd !== "R" → 탈퇴가 실제로 실패함(statCd 변화 없음).
      //   쿠키를 삭제하면 사용자가 재시도할 수 없으므로 세션 유지. 잠시 후 재시도 안내.
      if (recheck.ok) {
        return NextResponse.json(
          { error: "退会処理に失敗しました。しばらくしてから再度お試しください。" },
          { status: 502 },
        );
      }

      // 분기 3: 재조회 자체 실패 (QSP 통신 장애) → 탈퇴 결과 불명.
      //   부분 처리 가능성은 있으나 QSP 장애 상황에서 세션까지 끊으면 재시도 경로가 사라짐.
      //   쿠키 유지 + 재시도 안내. 탈퇴 완료가 실제 일어났다면 다음 로그인/요청에서 403 등으로 재노출됨.
      return NextResponse.json(
        { error: "退会処理の結果が確認できません。しばらくしてから再度お試しください。" },
        { status: 502 },
      );
    }

    // 3. JWT 쿠키 삭제 — 즉시 로그아웃. 탈퇴된 계정의 세션이 잔존해 permission/2FA 캐시로 오작동하는 것 방지.
    const response = NextResponse.json({
      data: { message: "会員退会が完了しました。" },
    });
    response.cookies.set(COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error("[POST /api/mypage/withdraw]", error);
    return NextResponse.json(
      { error: "退会処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
