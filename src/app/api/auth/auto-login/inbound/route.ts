import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuthRole } from "@/lib/auth";
import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { SITE_DEFAULTS } from "@/lib/config";
import { ConfigError } from "@/lib/errors";
import { COOKIE_NAME, signToken } from "@/lib/jwt";
import { fetchQspUserDetail } from "@/lib/qsp-member";
import { checkRateLimit } from "@/lib/rate-limit";
import type { LoginUser } from "@/lib/schemas/auth";
import { userTpSchema } from "@/lib/schemas/common";

/**
 * 외부 3사(HANASYS/Q.Order/Q.Musubi) → Q.Partners-neo 자동로그인 진입 라우트.
 *
 * 흐름 (Q.Partners-neo 내부 완결, QSP 로그인 API 미경유):
 *   1. 외부 3사가 자체 AES-256-CBC 암호화로 cipher 생성 (userId 단독)
 *   2. 사용자를 이 URL 로 리다이렉트: `?autoLoginParam1=<cipher>&userTp=<TYPE>`
 *   3. 본 핸들러가 cipher 복호화 → userId 획득 (cipher 유효 = 공유 키를 가진 신뢰된 3사 발급 증명)
 *   4. QSP userDetail (조회 전용) 로 사용자 정보·권한(authCd, storeLvl) 확보
 *   5. resolveAuthRole 로 authRole 결정 (일반 로그인 경로와 동일 규칙)
 *   6. Q.Partners-neo 자체 JWT 서명 발급 후 httpOnly 쿠키로 전파 + 홈(/) 리다이렉트
 *   7. 실패 시 /login?error=auto_login_failed 폴백 (사용자 친화적 UX)
 *
 * 왜 QSP 로그인 API 를 호출하지 않나:
 *   - AS-IS Q.Partners 레거시는 자체 로그인 API 가 있어 loginKey(pwd 스킵 트릭) 모드를 지원했지만,
 *     QSP (v1.0 사양서 기준) 는 자동로그인 모드를 지원하지 않음 — `loginKey` 파라미터 자체가 없음.
 *   - 자동로그인은 cipher 소유 자체를 "외부 3사에서 인증된 사용자" 증명으로 간주하고
 *     Q.Partners-neo 가 자체 세션을 발급한다 (QSP userDetail 은 메타데이터 조회에만 사용).
 *   - 2FA 는 스킵 — 외부 3사 SSO 경유 인증이라 Q.Partners-neo 에서 재요구하면 UX 파괴.
 *     단, SUPER_ADMIN 은 자동로그인 거부 (최소한의 고권한 계정 보호).
 *
 * 보안 방어 계층:
 *   - Rate Limit: IP 기반 20/분, fallback(IP 없음) userTp 기반 10/분. QSP DDoS 대행·AES 키 프로빙 차단.
 *   - Open Redirect 방어: request.url 대신 SITE_URL/SITE_DEFAULTS.url 을 base 로 사용 (Host 헤더 조작 무효화).
 *   - statCd 검증: 삭제("D")/탈퇴("R") 계정 자동로그인 차단.
 *   - authRole fail-closed: DB 조회 실패 시 ADMIN 경로는 거부, STORE 는 최소권한(2ND_STORE) 강제.
 *   - 리다이렉트 302: 307(메서드 보존·캐시 가능) 대신 302 로 SSO 폴백 의도 명확화.
 */

const inboundQuerySchema = z.object({
  autoLoginParam1: z.string().min(1, "autoLoginParam1は必須です"),
  userTp: userTpSchema,
});

const JWT_MAX_AGE_SEC = 60 * 60 * 8; // 8시간 — 일반 로그인과 동일

// Host 헤더 조작 기반 Open Redirect 방어 — env 없으면 사이트 기본 URL 사용.
// 다른 route(signup, password-reset 등)와 동일한 SITE_URL 관례를 따른다.
const BASE_URL = process.env.SITE_URL ?? SITE_DEFAULTS.url;

// Rate Limit — AES 복호화·QSP 외부 호출·JWT 서명은 모두 고비용이라 무제한 호출 시 QSP DDoS 대행,
// AES 키 프로빙 벡터가 됨. IP 우선, IP 없음 시 userTp 기반 (더 낮은 한도).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_IP_MAX = 20;
const RATE_LIMIT_ANON_MAX = 10;

function extractClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  return real?.trim() || null;
}

export async function GET(request: NextRequest) {
  const LOG = "[GET /api/auth/auto-login/inbound]";

  // 302 Found — GET SSO 진입 → GET 리다이렉트 의도. 307(Temp Redirect) 은 메서드 보존 + 일부 프록시 캐시 가능.
  // redirect(url, { status: 302 }) 는 string 시그니처만 수용하므로 URL 객체를 .toString() 으로 넘긴다.
  const failRedirect = (reason: string) => {
    console.warn(LOG, "자동로그인 실패 폴백:", reason);
    const url = new URL("/login?error=auto_login_failed", BASE_URL);
    return NextResponse.redirect(url.toString(), { status: 302 });
  };

  try {
    const searchParams = request.nextUrl.searchParams;
    const parsed = inboundQuerySchema.safeParse({
      autoLoginParam1: searchParams.get("autoLoginParam1") ?? "",
      userTp: searchParams.get("userTp") ?? "",
    });
    if (!parsed.success) {
      return failRedirect("query_validation_failed");
    }
    const { autoLoginParam1, userTp } = parsed.data;

    // 1. Rate Limit — IP 우선, 없으면 userTp 기반 (더 낮은 한도). 복호화·QSP·JWT 고비용 흐름 차단용.
    const clientIp = extractClientIp(request);
    const rateLimitKey = clientIp
      ? `auto-login-inbound:ip:${clientIp}`
      : `auto-login-inbound:anon:${userTp}`;
    const limit = clientIp ? RATE_LIMIT_IP_MAX : RATE_LIMIT_ANON_MAX;
    if (!checkRateLimit(rateLimitKey, limit, RATE_LIMIT_WINDOW_MS)) {
      console.warn(LOG, "Rate limit 초과:", { hasIp: clientIp !== null, userTp });
      return failRedirect("rate_limit_exceeded");
    }

    // 2. cipher 복호화 (자정 경계 fallback 내장)
    let userId: string;
    try {
      userId = decryptAutoLogin(autoLoginParam1);
    } catch (error: unknown) {
      // 설정 에러(AUTO_LOGIN_AES_KEY 미설정 등) 는 redirect 대신 500 — 운영자 즉시 인지 필요
      if (error instanceof ConfigError) {
        console.error(LOG, "설정 에러:", error.message);
        return NextResponse.json(
          { error: "サーバー設定エラーが発生しました" },
          { status: 500 },
        );
      }
      return failRedirect("decrypt_failed");
    }
    if (!userId || userId.trim().length === 0) {
      return failRedirect("empty_user_id");
    }

    // 3. QSP userDetail (조회 전용) — pwd 없이 메타데이터만 조회
    //    4번째 인수(로그용 userId) 는 생략 — qsp-member 내부에서 rawId 를 maskEmail 로 이미 마스킹하므로
    //    평문 userId 중복 전달은 PII 위험만 증가시킴.
    const userDetailResult = await fetchQspUserDetail(userId, userTp, LOG);
    if (!userDetailResult.ok) {
      return failRedirect(`user_detail_${userDetailResult.error.status}`);
    }
    const detail = userDetailResult.detail;

    // 4. 계정 상태 검증 — statCd "A"(active) 만 자동로그인 허용.
    //    "D"(deleted)/"R"(withdrawn) 계정은 비밀번호 없는 경로에서 특히 위험 — 거부.
    if (detail.statCd !== "A") {
      console.warn(LOG, "비활성 계정 자동로그인 거부:", { statCd: detail.statCd, userTp });
      return failRedirect("account_inactive");
    }

    // 5. authRole 결정 — /api/auth/login 과 동일 규칙 (DB 우선, 실패 시 fail-closed 폴백)
    //    catch 폴백 원칙:
    //      - ADMIN: DB 조회 실패 시 SUPER_ADMIN/ADMIN 구분 불가 → 자동로그인 거부 (최소 권한 원칙, fail-closed)
    //      - STORE: 항상 "2ND_STORE" (storeLvl 반영 생략, resolveAuthRole 의 "불명 → 2ND_STORE" 와 일치)
    //      - SEKO/GENERAL: 결정적 매핑
    let authRole: Awaited<ReturnType<typeof resolveAuthRole>>;
    try {
      authRole = await resolveAuthRole(userTp, detail.userId, detail.storeLvl);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : typeof error;
      console.warn(LOG, "authRole 결정 실패 — fail-closed 폴백:", { userTp, errorName });
      if (userTp === "ADMIN") {
        // ADMIN/SUPER_ADMIN 구분 불가 상태에서 SUPER_ADMIN 에게 자동로그인을 허용하면 고권한 계정이 2FA 없이
        // JWT 발급됨. 최소 권한 원칙에 따라 ADMIN 경로는 DB 복구 후 재시도하도록 거부.
        return failRedirect("auth_role_db_fail_admin");
      }
      if (userTp === "STORE") {
        authRole = "2ND_STORE";
      } else if (userTp === "SEKO") {
        authRole = "SEKO";
      } else {
        authRole = "GENERAL";
      }
    }

    // 6. 고권한 계정 자동로그인 정책 — SUPER_ADMIN 거부, ADMIN 은 감사 로그 남기고 허용.
    //    Replay 방어가 1차로 Rate Limit 에만 의존하는 현 상태에서 최소한의 고권한 보호.
    if (authRole === "SUPER_ADMIN") {
      console.warn(LOG, "SUPER_ADMIN 자동로그인 거부 — 일반 로그인 경로 사용 필요:", { userTp });
      return failRedirect("super_admin_auto_login_denied");
    }
    if (authRole === "ADMIN") {
      console.info(LOG, "ADMIN 자동로그인 — 감사 로그:", {
        userTp,
        ip: clientIp ?? "unknown",
        ua: request.headers.get("user-agent")?.slice(0, 120) ?? "unknown",
      });
    }

    // 7. LoginUser 페이로드 구성
    //    - twoFactorVerified: true — 자동로그인은 2FA 스킵 (cipher 소유 = 외부 3사 인증 증명)
    //    - pwdInitYn: userDetail 은 z.string().nullable() 로 수신되므로 "Y"/"N" 만 통과시키고 그 외는 null
    const pwdInitYn: "Y" | "N" | null = detail.pwdInitYn === "Y"
      ? "Y"
      : detail.pwdInitYn === "N"
        ? "N"
        : null;

    const user: LoginUser = {
      userId: detail.userId,
      userNm: detail.userNm,
      userTp,
      compCd: detail.compCd,
      compNm: detail.compNm,
      email: detail.email,
      deptNm: detail.deptNm,
      authCd: detail.authCd,
      storeLvl: detail.storeLvl,
      statCd: detail.statCd,
      authRole,
      twoFactorVerified: true,
      pwdInitYn,
      telNo: detail.compTelNo ?? null,
    };

    // 8. JWT 서명
    //    - ConfigError(JWT_SECRET 미설정) 는 redirect 대신 500 — 운영자가 설정 누락을 즉시 인지해야 함
    //      (redirect 폴백으로 흡수하면 "사용자 자동로그인이 그냥 실패" 로만 보고되어 추적이 늦어짐)
    let token: string;
    try {
      token = await signToken(user);
    } catch (error: unknown) {
      if (error instanceof ConfigError) {
        console.error(LOG, "JWT 설정 에러:", error.message);
        return NextResponse.json(
          { error: "サーバー設定エラーが発生しました" },
          { status: 500 },
        );
      }
      console.error(LOG, "JWT 생성 실패:", error);
      return failRedirect("jwt_sign_failed");
    }

    // 9. 홈 리다이렉트 + httpOnly 쿠키 (일반 로그인과 동일 속성)
    //    base 는 BASE_URL (Host 헤더 조작 방어). 302 로 명시.
    const homeUrl = new URL("/", BASE_URL);
    const response = NextResponse.redirect(homeUrl.toString(), { status: 302 });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: JWT_MAX_AGE_SEC,
    });
    return response;
  } catch (error: unknown) {
    console.error(LOG, error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
