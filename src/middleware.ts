import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyToken, COOKIE_NAME } from "@/lib/jwt";

/** 인증 없이 접근 가능한 API 경로 (matcher 범위 내 경로만 등록) */
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/login-user-info", // 프론트엔드 로그인 상태 확인용 — 인증 실패 시 401은 핸들러에서 직접 처리
  "/api/auth/signup",
  "/api/auth/email/check",
  "/api/auth/password-reset/request",
  "/api/auth/password-reset/verify",
  "/api/auth/password-reset/confirm",
  "/api/openapi",
];

/** 2차 인증 미완료 상태에서 접근 가능한 경로 */
const TWO_FACTOR_PATHS = [
  "/api/auth/two-factor/send",
  "/api/auth/two-factor/verify",
  "/api/auth/logout",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

function isTwoFactorPath(pathname: string): boolean {
  return TWO_FACTOR_PATHS.includes(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

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

  // 2차 인증 미완료 상태: 제한된 경로만 허용
  if (user.twoFactorVerified === false && !isTwoFactorPath(pathname)) {
    return NextResponse.json(
      { error: "2차 인증이 필요합니다" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

/**
 * matcher: /api/* 경로만 보호.
 * 페이지 라우트(/dashboard, /admin 등)는 현재 미존재.
 * 페이지 추가 시 matcher 확장 또는 페이지별 인증 처리 필요.
 */
export const config = {
  matcher: ["/api/:path*"],
};
