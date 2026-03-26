import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyToken, COOKIE_NAME } from "@/lib/jwt";

// GET /api/auth/me — 현재 로그인 사용자 정보
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "인증되지 않은 사용자입니다" },
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

  return NextResponse.json({ data: user });
}
