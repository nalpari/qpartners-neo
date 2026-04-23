import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { COOKIE_NAME, getUserFromRequest } from "@/lib/jwt";
import { withdrawSchema } from "@/lib/schemas/mypage";
import { qspUpdateResponseSchema } from "@/lib/schemas/member";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { fetchQspUserDetail } from "@/lib/qsp-member";

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
 * 3. Zod (withdrawSchema) 로 reason 검증
 * 4. QSP userDetail 로 필수값 확보 (updateUserDtl 가 성명/회사 등 필수 요구)
 * 5. QSP updateUserDtl 호출 — statCd="R" 로 전환 + resignRsn 전송
 *    - QSP 가 resignRsn 필드를 수용하지 않아도 interface log (fetchWithLog 자동 기록) 에 요청 body 가
 *      저장되어 사후 추적 가능. 로컬 qp_info 탈퇴 이력 테이블은 추후 migration 시 연결 (TODO).
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

    // 1. QSP userDetail 로 현재값 조회 — updateUserDtl 는 성명/회사/주소 등 필수 필드 요구.
    const detailResult = await fetchQspUserDetail(
      user.userId,
      user.userTp,
      "[POST /api/mypage/withdraw]",
    );
    if (!detailResult.ok) {
      return NextResponse.json(
        { error: detailResult.error.error },
        { status: detailResult.error.status },
      );
    }
    const current = detailResult.detail;

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

    // 2. QSP updateUserDtl 호출 — statCd="R" 로 전환.
    //    누락 필드는 QSP 가 기존 값 보존 → 필수값만 재전송, mutable 필드 중 탈퇴 관련만 덮어씀.
    //    resignRsn 은 QSP 가 수용하면 저장, 아니면 silently drop. 탈퇴 이유는 interface log 에 잔존.
    const qspPayload = {
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
      userId: user.userId,
      loginId: user.userId,
      email: user.email,
      userTp: user.userTp,
      user1stNm: current.user1stNm ?? "",
      user2ndNm: current.user2ndNm ?? "",
      user1stNmKana: current.user1stNmKana ?? "",
      user2ndNmKana: current.user2ndNmKana ?? "",
      compNm: current.compNm ?? "",
      compNmKana: current.compNmKana ?? "",
      compPostCd: current.compPostCd ?? "",
      compAddr: current.compAddr ?? "",
      compAddr2: current.compAddr2 ?? "",
      compTelNo: current.compTelNo ?? "",
      compFaxNo: current.compFaxNo ?? "",
      newsRcptYn: current.newsRcptYn ?? "N",
      statCd: "R",
      resignRsn: reason,
      updBy: user.userId,
    };

    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        QSP_API.updateUserDtl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify(qspPayload),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "updateUserDtl",
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

      // TOCTOU Race Condition 완화: 사전 체크(statCd !== "R") 와 updateUserDtl 호출 사이에
      // 다른 경로(다른 탭/기기) 로 이미 탈퇴 처리가 완료되었을 가능성을 재확인.
      // 실패 직후 userDetail 재조회 → statCd === "R" 이면 409 로 매핑 + 쿠키 삭제.
      const recheck = await fetchQspUserDetail(
        user.userId,
        user.userTp,
        "[POST /api/mypage/withdraw][recheck]",
      );
      if (recheck.ok && recheck.detail.statCd === "R") {
        const resp = NextResponse.json(
          { error: "既に退会済みの会員です" },
          { status: 409 },
        );
        resp.cookies.set(COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
        return resp;
      }

      return NextResponse.json(
        { error: "退会処理に失敗しました" },
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
