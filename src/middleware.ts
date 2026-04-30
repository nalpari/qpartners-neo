import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getFallbackRole } from "@/lib/auth-role";
import { ConfigError } from "@/lib/errors";
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
  // 외부 3사(HANASYS/Q.Order/Q.Musubi) → Q.Partners-neo 자동로그인 진입 라우트.
  // cipher 복호화 + QSP userDetail 조회 후 Q.Partners-neo 자체 JWT 서명·발급 → 홈 리다이렉트.
  // (QSP v1.0 은 loginKey 미지원 — cipher 소유 자체를 인증 증명으로 간주. 상세는 route.ts 파일 상단 주석 참조)
  "/api/auth/auto-login/inbound",
  "/api/openapi",
  // 문의 등록 POST 단일 핸들러 전제 — route handler 내부 rate limit 적용
  // sub-route(/api/inquiry/[id] 등) 추가 시 PUBLIC_GET_PATTERNS로 분리할 것
  "/api/inquiry",
];

/** GET 요청에 한해 비회원도 접근 가능한 경로 패턴 (조회 전용) */
const PUBLIC_GET_PATTERNS = [
  /^\/api\/contents(\/\d+)?$/, // GET /api/contents, GET /api/contents/[id]
  /^\/api\/categories(\/\d+)?$/, // GET /api/categories, GET /api/categories/[id]
  /^\/api\/home-notices\/active$/, // GET /api/home-notices/active
  /^\/api\/codes\/lookup$/, // GET /api/codes/lookup — 문의하기 문의유형 코드 조회
];

/** 2차 인증 미완료 상태에서 접근 가능한 경로 */
const TWO_FACTOR_PATHS = [
  "/api/auth/two-factor/send",
  "/api/auth/two-factor/verify",
  "/api/auth/password-init",    // 최초 로그인 비밀번호 변경
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

/**
 * userTp → authRole 폴백은 `src/lib/auth.ts#getFallbackRole` 공용 헬퍼를 사용한다.
 * 이 헬퍼는 `resolveAuthRole` / `requirePageMenuPermission` / admin layout 과 동일 규칙으로
 * 최소 권한 폴백을 적용해 FE/BE 전역 일관성을 보장한다.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicGet = isPublicGetPath(pathname, request.method);

  if (isPublicPath(pathname) || isPublicGet) {
    // GET 조회 경로에 한해 JWT가 있으면 사용자 정보 헤더 주입 (최소 권한 원칙)
    // categories?activeOnly=false 등 route handler 내부에서 관리자 권한 체크하는 케이스 대응
    // POST 경로(/api/inquiry, /api/auth/signup 등)에는 헤더 주입하지 않음
    if (isPublicGet) {
      const publicToken = request.cookies.get(COOKIE_NAME)?.value;
      if (publicToken) {
        try {
          const publicUser = await verifyToken(publicToken);
          // 2FA 미완료 사용자는 비회원으로 통과 (관리자 전용 데이터 접근 방지)
          if (publicUser && publicUser.twoFactorVerified !== false) {
            // authRole 포함 JWT → 그대로 사용. 과도기 JWT → userTp 폴백.
            // 폴백도 실패(미지의 userTp)하면 public GET 특성상 비회원으로 자연 통과.
            const role = publicUser.authRole ?? getFallbackRole(publicUser.userTp);
            if (role) {
              const requestHeaders = new Headers(request.headers);
              requestHeaders.set("X-User-Type", publicUser.userTp);
              requestHeaders.set("X-User-Id", publicUser.userId);
              requestHeaders.set("X-User-Role", role);
              return NextResponse.next({ request: { headers: requestHeaders } });
            }
          }
        } catch (error) {
          // ConfigError(JWT_SECRET 미설정) = 서버 설정 문제 → protected path와 동일하게 500 반환
          if (error instanceof ConfigError) {
            console.error("[middleware] CRITICAL 설정 에러 (public GET):", error);
            return NextResponse.json(
              { error: "サーバー設定エラーが発生しました" },
              { status: 500 },
            );
          }
          // 토큰 만료·서명 불일치는 정상 — 비회원으로 통과
          console.warn("[middleware] public GET JWT 검증 실패 (비회원 통과):", error);
        }
      }
    }
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
  // TODO: 과도기 제거 — authRole 없는 토큰이 0건이 되면 optional 제거 + 폴백 로직 삭제
  const role = user.authRole ?? (() => {
    console.warn(
      "[middleware] 과도기 JWT — authRole 없음, userTp 기반 최소권한 폴백 시도 (userTp:",
      user.userTp,
      ")",
    );
    return getFallbackRole(user.userTp);
  })();
  if (!role) {
    // 미지의 userTp + authRole 없음 — fail-closed 로 401 반환 (GENERAL 폴백 금지 정책)
    return NextResponse.json(
      { error: "認証情報が不正です" },
      { status: 401 },
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-User-Type", user.userTp);
  requestHeaders.set("X-User-Id", user.userId);
  requestHeaders.set("X-User-Role", role);
  if (user.deptNm) {
    requestHeaders.set("X-User-Department", encodeURIComponent(user.deptNm));
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
