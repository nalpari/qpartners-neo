import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyToken, COOKIE_NAME } from "@/lib/jwt";

// GET /api/auth/login-user-info — 현재 로그인 사용자 정보
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

  // sekoToken(SEKO Connector Bearer) 은 서버 전용 — JWT 페이로드에만 보관하고 클라이언트
  // 응답에서는 제외한다. login 라우트와 동일 패턴(undefined 는 JSON 직렬화에서 생략됨).
  return NextResponse.json({ data: { ...user, sekoToken: undefined } });
}
