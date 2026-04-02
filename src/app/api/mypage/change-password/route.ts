import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { changePasswordSchema } from "@/lib/schemas/mypage";
import { qspResponseSchema } from "@/lib/schemas/signup";

// POST /api/mypage/change-password — 비밀번호 변경
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 },
      );
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "토큰이 만료되었거나 유효하지 않습니다" },
        { status: 401 },
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
      console.error("[POST /api/mypage/change-password] QSP API 호출 실패:", error);
      return NextResponse.json(
        { error: "외부 서버에 연결할 수 없습니다" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[POST /api/mypage/change-password] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "외부 서버 오류가 발생했습니다" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch {
      return NextResponse.json(
        { error: "외부 서버 응답을 처리할 수 없습니다" },
        { status: 502 },
      );
    }

    const parsed = qspResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[POST /api/mypage/change-password] QSP 응답 스키마 불일치:", parsed.error);
      return NextResponse.json(
        { error: "외부 서버 응답 형식이 올바르지 않습니다" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S") {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: { message: "パスワードが変更されました" },
    });
  } catch (error) {
    console.error("[POST /api/mypage/change-password]", error);
    return NextResponse.json(
      { error: "비밀번호 변경 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
