import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { withdrawSchema } from "@/lib/schemas/mypage";

// POST /api/mypage/withdraw — 회원탈퇴 (일반회원만)
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

    // 일반회원만 탈퇴 가능
    if (user.userTp !== "GENERAL") {
      return NextResponse.json(
        { error: "一般会員のみ退会が可能です" },
        { status: 403 },
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

    const result = withdrawSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // TODO: QSP 탈퇴 API 호출 (엔드포인트 확인 후 구현)
    // TODO: qp_info 테이블 withdrawn=true, withdrawn_at, withdrawn_reason 저장

    // JWT 쿠키 삭제 (로그아웃)
    const response = NextResponse.json({
      data: { message: "退会が完了しました。ご利用ありがとうございました。" },
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
    console.error("[POST /api/mypage/withdraw]", error);
    return NextResponse.json(
      { error: "회원탈퇴 처리 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
