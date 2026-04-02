import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { changePasswordSchema } from "@/lib/schemas/mypage";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/mypage/change-password — 비밀번호 변경
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 },
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
    } catch (error) {
      console.error("[POST /api/mypage/change-password] QSP 응답 JSON 파싱 실패:", error);
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
      console.error(
        "[POST /api/mypage/change-password] QSP 실패:",
        parsed.data.result.resultCode,
        parsed.data.result.resultMsg,
      );
      return NextResponse.json(
        { error: parsed.data.result.resultMsg || "パスワード変更に失敗しました" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: { message: "비밀번호가 변경되었습니다" },
    });
  } catch (error) {
    console.error("[POST /api/mypage/change-password]", error);
    return NextResponse.json(
      { error: "비밀번호 변경 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
