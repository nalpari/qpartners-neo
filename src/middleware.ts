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

/** GET 요청에 한해 비회원도 접근 가능한 경로 패턴 (조회 전용) */
const PUBLIC_GET_PATTERNS = [
  /^\/api\/contents(\/\d+)?$/, // GET /api/contents, GET /api/contents/[id]
  /^\/api\/categories(\/\d+)?$/, // GET /api/categories, GET /api/categories/[id]
  /^\/api\/home-notices\/active$/, // GET /api/home-notices/active
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

function isPublicGetPath(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  return PUBLIC_GET_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isTwoFactorPath(pathname: string): boolean {
  return TWO_FACTOR_PATHS.includes(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname) || isPublicGetPath(pathname, request.method)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }

  let user;
  try {
    user = await verifyToken(token);
  } catch (error) {
    console.error("[middleware] CRITICAL 설정 에러:", error);
    return NextResponse.json(
      { error: "サーバー設定エラーが発生しました" },
      { status: 500 },
    );
  }

  if (!user) {
    console.warn("[middleware] 토큰 검증 실패 — 만료 또는 서명 불일치");
    return NextResponse.json(
      { error: "トークンが期限切れまたは無効です" },
      { status: 401 },
    );
  }

  // 2차 인증 미완료 상태: 제한된 경로만 허용
  // false: 2FA 필요하나 미완료 / true: 2FA 검증 완료 또는 2FA 불필요 (fail-closed 설계)
  if (user.twoFactorVerified === false
    && !isTwoFactorPath(pathname)
    && !isPublicGetPath(pathname, request.method)) {
    return NextResponse.json(
      { error: "2段階認証が必要です" },
      { status: 403 },
    );
  }

  // JWT 검증된 사용자 정보를 X-User-* 헤더로 주입 — route handler에서 getUserFromHeaders로 참조
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-User-Type", user.userTp);
  requestHeaders.set("X-User-Id", user.userId);
  // TODO: 과도기 제거 — authRole 없는 토큰이 0건이 되면 optional 제거
  if (!user.authRole) {
    console.warn("[middleware] 과도기 JWT — authRole 없음, GENERAL 폴백 적용 (userTp:", user.userTp, ")");
  }
  requestHeaders.set("X-User-Role", user.authRole ?? "GENERAL");
  if (user.deptNm) {
    requestHeaders.set("X-User-Department", user.deptNm);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

/**
 * matcher: /api/* 경로만 보호.
 * 페이지 라우트(/dashboard, /admin 등)는 현재 미존재.
 * 페이지 추가 시 matcher 확장 또는 페이지별 인증 처리 필요.
 */
export const config = {
  matcher: ["/api/:path*"],
};
