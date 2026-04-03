import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { changePasswordSchema } from "@/lib/schemas/mypage";
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
    } catch {
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

    // QSP userPwdChg API 호출 (chgType=C: 변경)
    let qspResponse: Response;
    try {
      qspResponse = await fetch(QSP_API.passwordChange, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          accsSiteCd: "QPARTNERS",
          loginId: user.userId,
          userTp: user.userTp,
          pwd: currentPwd,
          newPwd,
          chgType: "C",
        }),
      });
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
    console.error("[POST /api/mypage/password-change]", error);
    return NextResponse.json(
      { error: "パスワード変更中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
