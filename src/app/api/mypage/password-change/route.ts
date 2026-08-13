import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { getUserFromRequest, sessionInvalidResponse } from "@/lib/jwt";
import { changePasswordSchema } from "@/lib/schemas/mypage";
import { sekoChangePwd } from "@/lib/seko-connector";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/mypage/password-change — 비밀번호 변경
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

    // 유저당 5분간 5회 제한 (비밀번호 brute-force 방지)
    if (!checkRateLimit(`chg-pwd:${user.userId}`, 5, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/mypage/password-change] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = changePasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const { currentPwd, newPwd } = result.data;

    // 시공점(SEKO) — AS-IS Q.Partners Connector changePwd(chgType=C) 로 변경 (QSP 미경유).
    if (user.userTp === "SEKO") {
      if (!user.sekoToken) {
        console.error("[POST /api/mypage/password-change] SEKO 세션 토큰 없음 — 재로그인 필요");
        return sessionInvalidResponse("セッションが無効です。再度ログインしてください");
      }
      // 시공점 loginId = email (사양). 로그인 시 email ?? loginId 로 JWT 에 보장 저장.
      // 누락은 세션 결손 — userId(다른 식별자)로 대체 전송하지 않고 재로그인 유도(profile 라우트와 동일 정책).
      if (!user.email) {
        console.error("[POST /api/mypage/password-change] SEKO email(=loginId) 누락 — 재로그인 필요");
        return sessionInvalidResponse("セッション情報が不完全です。再度ログインしてください");
      }
      const changeResult = await sekoChangePwd(
        { chgType: "C", loginId: user.email, currentPwd, newPwd },
        user.sekoToken,
        "[POST /api/mypage/password-change][SEKO]",
      );
      if (!changeResult.ok) {
        return NextResponse.json(
          { error: changeResult.error.error },
          { status: changeResult.error.status },
        );
      }
      return NextResponse.json({
        data: { message: "パスワードが変更されました" },
      });
    }

    // QSP userPwdChg API 호출 (chgType=C: 변경)
    // QSP 사양서 기준 새 비밀번호 필드명은 chgPwd (newPwd 아님)
    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        QSP_API.userPwdChg,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            accsSiteCd: "QPARTNERS",
            loginId: user.userId,
            userTp: user.userTp,
            pwd: currentPwd,
            chgPwd: newPwd,
            chgType: "C",
          }),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "userPwdChg",
          callerRoute: "[POST /api/mypage/password-change]",
          userId: maskEmail(user.userId),
          userType: user.userTp,
        },
      );
    } catch (error) {
      console.error("[POST /api/mypage/password-change] QSP API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[POST /api/mypage/password-change] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error("[POST /api/mypage/password-change] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[POST /api/mypage/password-change] QSP 응답 스키마 불일치:", parsed.error);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S") {
      console.error(
        "[POST /api/mypage/password-change] QSP 실패:",
        parsed.data.result.resultCode,
        parsed.data.result.resultMsg,
      );
      return NextResponse.json(
        { error: "パスワード変更に失敗しました" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: { message: "パスワードが変更されました" },
    });
  } catch (error) {
        // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 일반 500 에 흡수되면 운영자가 env 누락을 코드 버그·DB 장애와 구분할 수 없다
    // (.claude/rules/api.md "어떤 환경변수가 누락됐는지 에러 메시지에 명시").
    if (error instanceof ConfigError) {
      console.error("[POST /api/mypage/password-change] 설정 에러:", error.name, "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요");
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
console.error("[POST /api/mypage/password-change]", error);
    return NextResponse.json(
      { error: "パスワード変更中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
