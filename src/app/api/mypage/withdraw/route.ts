import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { withdrawSchema } from "@/lib/schemas/mypage";

// POST /api/mypage/withdraw — 회원탈퇴 (일반회원만)
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
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

    // TODO: QSP 탈퇴 API 호출 (saveResignReq) + qp_info 테이블 갱신
    // QSP 연동 완료 전까지 501 반환
    return NextResponse.json(
      { error: "会員退会APIはまだ連動されていません" },
      { status: 501 },
    );
  } catch (error) {
    console.error("[POST /api/mypage/withdraw]", error);
    return NextResponse.json(
      { error: "회원탈퇴 처리 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
