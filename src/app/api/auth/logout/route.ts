import { NextResponse } from "next/server";

import { COOKIE_NAME } from "@/lib/jwt";

// POST /api/auth/logout — 로그아웃 (쿠키 삭제)
export async function POST() {
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
}
