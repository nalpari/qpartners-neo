import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuthRole } from "@/lib/auth";
import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { SITE_DEFAULTS } from "@/lib/config";
import { ConfigError } from "@/lib/errors";
import { logInbound, maskUserId } from "@/lib/interface-logger";
import { COOKIE_NAME, signToken } from "@/lib/jwt";
import { fetchQspUserDetail } from "@/lib/qsp-member";
import { checkRateLimit } from "@/lib/rate-limit";
import type { LoginUser } from "@/lib/schemas/auth";
import { userTpSchema } from "@/lib/schemas/common";

/**
 * 외부 3사(HANASYS/Q.Order/Q.Musubi) → Q.Partners-neo 자동로그인 진입 라우트.
 *
 * 흐름 (Q.Partners-neo 내부 완결, QSP 로그인 API 미경유):
 *   1. 외부 3사가 자체 AES-128-CBC 암호화로 cipher 생성 (userId 단독, 결정적 IV `YYYYMMDD_autoL!!`)
 *      ※ 사양 상세는 `auto-login-crypto.ts` 또는 `docs/auto-login-inbound-guide.md` 참조.
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
 *   - 2FA 정책: ADMIN 은 twoFactorVerified=false 로 2FA 강제, SUPER_ADMIN 은 자동로그인 거부.
 *     그 외(STORE/SEKO/GENERAL)는 2FA 스킵 — 외부 3사 SSO 경유 인증이라 재요구 시 UX 파괴.
 *
 * 보안 방어 계층:
 *   - Rate Limit: IP 기반 20/분, IP 식별 불가 시 즉시 거부 (fail-closed). QSP DDoS 대행·AES 키 프로빙 차단.
 *   - Open Redirect 방어: request.url 대신 SITE_URL/SITE_DEFAULTS.url 을 base 로 사용 (Host 헤더 조작 무효화).
 *   - statCd 검증: 삭제("D")/탈퇴("R") 계정 자동로그인 차단.
 *   - authRole fail-closed: DB 조회 실패 시 ADMIN 경로는 거부, STORE 는 최소권한(2ND_STORE) 강제.
 *   - 리다이렉트 302: 307(메서드 보존·캐시 가능) 대신 302 로 SSO 폴백 의도 명확화.
 *
 * Cipher replay 정책 (2026-04-30 결정):
 *   - inbound 측 1회용 소진 차단을 **제거** — outbound 받는 측 (외부 3사) 와 동일 정책으로 통일.
 *   - 결정적 IV 사양상 같은 사용자·같은 날 cipher 가 동일하게 발생 → 정상 사용자도 차단되는 UX 부작용.
 *   - 받아들인 위험: cipher 탈취 시 24h 내 재사용 가능 (외부 3사 inbound 도 동일 위험을 안고 있음).
 *   - 대응: 외부 3사 측 cipher 노출 표면 (브라우저 히스토리·Referer·로그) 의 표준 보호에 의존.
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
// AES 키 프로빙 벡터가 됨. IP 식별 불가 시 즉시 거부 (fail-closed).
//
// 한계(인지 사항): 인메모리 카운터(`@/lib/rate-limit`) — 다중 워커/다중 인스턴스 환경에서는
// 워커 별로 독립 카운터가 작동하므로 실효 한도가 `20 × N(워커 수)` 로 증가한다.
// 정확한 글로벌 레이트 제한이 필요하면 (1) 인프라 레벨(ALB/WAF) 보완 또는
// (2) Redis 기반 공유 카운터로 전환을 검토. 현재 시점에는 기능 자체보다 비용 폭주 차단·
// 키 프로빙 둔화가 1차 목적이라 인메모리 한계를 받아들임.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_IP_MAX = 20;

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
  const startTime = performance.now();
  // 진입 시각 — INBOUND 로그의 created_at override 용. wrapper 종료 시점에 insert 되더라도
  // DB 시간순 조회(ORDER BY created_at) 시 본 INBOUND 행이 흐름 도중의 OUTBOUND userDetail
  // 호출보다 먼저 보이도록 한다 (외부 3사 진입 → QSP 검증 → 결과 순서가 자연스럽게 보이게).
  const startedAt = new Date();
  const requestUrl = request.url;

  // INBOUND 로그 컨텍스트 — closure 로 inner handle 함수에서 mutate.
  // 진입 단계별 식별 정보 (userTp / userId 마스킹) 가 확보되는 시점에 갱신.
  let logUserType: string | undefined;
  let logUserId: string | undefined;
  let failReason: string | null = null;

  // 302 Found — GET SSO 진입 → GET 리다이렉트 의도. 307(Temp Redirect) 은 메서드 보존 + 일부 프록시 캐시 가능.
  // redirect(url, { status: 302 }) 는 string 시그니처만 수용하므로 URL 객체를 .toString() 으로 넘긴다.
  const failRedirect = (reason: string) => {
    console.warn(LOG, "자동로그인 실패 폴백:", reason);
    failReason = reason;
    const url = new URL("/login?error=auto_login_failed", BASE_URL);
    return NextResponse.redirect(url.toString(), { status: 302 });
  };

  // inner handle — 모든 응답 경로를 한 곳에서 받아 finally 의 INBOUND 로그에 일관 반영.
  // ─────────────────── handle() inner 본문 시작 ───────────────────
  const handle = async (): Promise<NextResponse> => {
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
    logUserType = userTp;

    // 1. Rate Limit — IP 식별 불가 시 즉시 거부 (fail-closed). 복호화·QSP·JWT 고비용 흐름 차단용.
    //    IP 부재 시 anon 공유 버킷은 userTp 4개뿐이라 정상 사용자 DoS 벡터가 됨.
    const clientIp = extractClientIp(request);
    if (!clientIp) {
      console.warn(LOG, "IP 식별 불가 — 즉시 거부 (fail-closed):", { userTp });
      return failRedirect("no_client_ip");
    }
    const rateLimitKey = `auto-login-inbound:ip:${clientIp}`;
    if (!checkRateLimit(rateLimitKey, RATE_LIMIT_IP_MAX, RATE_LIMIT_WINDOW_MS)) {
      console.warn(LOG, "Rate limit 초과:", { userTp });
      return failRedirect("rate_limit_exceeded");
    }

    // 2. cipher 복호화 (자정 경계 fallback 내장)
    let userId: string;
    try {
      userId = decryptAutoLogin(autoLoginParam1);
    } catch (error: unknown) {
      // 설정 에러(AUTO_LOGIN_AES_KEY 미설정·16 byte 길이 불일치 등) 는 redirect 대신 500 — 운영자 즉시 인지 필요
      if (error instanceof ConfigError) {
        console.error(LOG, "설정 에러:", error.message);
        failReason = "decrypt_config_error";
        return NextResponse.json(
          { error: "サーバー設定エラーが発生しました" },
          { status: 500 },
        );
      }
      return failRedirect("decrypt_failed");
    }
    const trimmedUserId = userId.trim();
    if (trimmedUserId.length === 0) {
      return failRedirect("empty_user_id");
    }
    // userId 마스킹 — STORE/SEKO/ADMIN 의 loginId 는 `@` 없는 식별자(예: "1301011") 라
    // maskEmail 사용 시 원문이 그대로 DB 에 저장됨 (`if (atIdx <= 0) return value`).
    // maskUserId 는 이메일은 maskEmail, 그 외는 앞 2자 + "***" 로 축약하여 PII 누출 차단.
    logUserId = maskUserId(trimmedUserId);
    // userId 형식 가드 — 수 KB 페이로드로 QSP 414/메모리 낭비, 제어 문자 주입 방어
    if (trimmedUserId.length > 255) {
      console.warn(LOG, "userId 길이 초과:", { length: trimmedUserId.length, userTp });
      return failRedirect("user_id_too_long");
    }
    // 영숫자, 하이픈, 언더스코어, 점, @, +(plus addressing) 허용 — QSP loginId/email 범위
    if (!/^[\w.@+-]+$/.test(trimmedUserId)) {
      console.warn(LOG, "userId 형식 불일치:", { userTp });
      return failRedirect("user_id_invalid_format");
    }

    // 3. QSP userDetail (조회 전용) — pwd 없이 메타데이터만 조회
    //    4번째 인수(로그용 userId) 는 생략 — qsp-member 내부에서 rawId 를 maskEmail 로 이미 마스킹하므로
    //    평문 userId 중복 전달은 PII 위험만 증가시킴.
    const userDetailResult = await fetchQspUserDetail(trimmedUserId, userTp, LOG);
    if (!userDetailResult.ok) {
      return failRedirect(`user_detail_${userDetailResult.error.status}`);
    }
    const detail = userDetailResult.detail;

    // 3-1. userTp 교차 검증 — cipher에는 userId만 포함되고 userTp는 평문 쿼리.
    //    공격자가 userTp를 변조하면 다른 계정 유형으로 QSP 조회 경로가 전환됨.
    //    QSP 응답의 userTp와 쿼리 파라미터 userTp가 일치하는지 검증.
    if (!detail.userTp || detail.userTp !== userTp) {
      console.warn(LOG, "userTp 불일치 — 쿼리 변조 의심:", {
        queryUserTp: userTp,
        qspUserTp: detail.userTp,
      });
      return failRedirect("user_tp_mismatch");
    }

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
    // GENERAL 사용자는 회원관리에서 할당한 authCd 가 JWT authRole 에 반영되도록 4번째 인자로 전달.
    let authRole: Awaited<ReturnType<typeof resolveAuthRole>>;
    try {
      authRole = await resolveAuthRole(userTp, detail.userId, detail.storeLvl, detail.authCd ?? null);
    } catch (error: unknown) {
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
    if (authRole === "SUPER_ADMIN") {
      console.warn(LOG, "SUPER_ADMIN 자동로그인 거부 — 일반 로그인 경로 사용 필요:", { userTp });
      return failRedirect("super_admin_auto_login_denied");
    }
    if (authRole === "ADMIN") {
      console.info(LOG, "ADMIN 자동로그인 — 감사 로그:", {
        userTp,
        ip: clientIp,
        ua: request.headers.get("user-agent")?.slice(0, 120) ?? "unknown",
      });
    }

    // 7. LoginUser 페이로드 구성
    //    - twoFactorVerified: ADMIN은 false(2FA 강제) — cipher 24h 재사용 가능성에 대한 고권한 보호
    //      그 외(STORE/SEKO/GENERAL)는 true — 외부 3사 SSO 경유 인증이라 2FA 재요구 시 UX 파괴
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
      // QSP 응답의 pwdInitYn — qspMemberDetailSchema 가 string 으로 받지만 LoginUser 는 "Y"/"N" enum.
      // 알 수 없는 값은 null 로 폴백 (다음 로그인 시 personal-info 분기 통과 — 보수적 fail-open).
      pwdInitYn: detail.pwdInitYn === "Y" || detail.pwdInitYn === "N" ? detail.pwdInitYn : null,
      authRole,
      // login route 와 동일 정책 — pwdInitYn=N 회원은 ADMIN 아니어도 false 강제하여
      // password-init 가드(`!twoFactorVerified || pwdInitYn==="N"`) 통과 가능. SSO 경유로 진입한
      // 최초 로그인 회원도 personal-info popup 흐름이 정상 동작하도록 통일.
      twoFactorVerified: authRole !== "ADMIN" && detail.pwdInitYn !== "N",
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
        failReason = "jwt_config_error";
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
    //
    //    [정책 #2125 / Q3 결정] inbound 자동로그인 시 로그인 알림 메일 발송 제외.
    //      외부 3사(HANASYS/Q.Order/Q.Musubi) SSO 경유는 본인 의도된 진입이므로 알림 노이즈.
    //      이상 동작 인지는 /api/auth/login 경로가 커버한다. (loginNotiYn 분기 없음 — 의도적 누락)
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
    // ConfigError(설정 누락)는 inner try-catch에서 500 JSON으로 처리 — 운영자 즉시 인지.
    // 여기 도달하는 예외는 예측 불가 런타임 에러 → 브라우저에 JSON 노출 대신 failRedirect로 통일.
    console.error(LOG, "예측 불가 에러:", error);
    return failRedirect("unexpected_runtime_error");
  }
  };
  // ─────────────────── handle() inner 본문 끝 ───────────────────

  const response = await handle();

  // INBOUND 로그 — 진입 ~ 종료 1회 기록 (fire-and-forget).
  //  - resultCode "S": failReason 미설정(정상 홈 리다이렉트 경로)
  //  - resultCode "F": failReason 설정(폴백/설정에러 경로) — errorMessage 에 사유 보존
  //  - responseStatus: 실제 응답 status (302 redirect / 500 ConfigError JSON)
  //  - createdAt: 진입 시각 — 같은 흐름의 OUTBOUND userDetail 보다 시간순 먼저 보이도록 명시.
  logInbound({
    apiName: "autoLogin",
    callerRoute: LOG,
    method: "GET",
    requestUrl,
    responseStatus: response.status,
    resultCode: failReason === null ? "S" : "F",
    durationMs: Math.round(performance.now() - startTime),
    userId: logUserId,
    userType: logUserType,
    errorMessage: failReason,
    createdAt: startedAt,
  });

  return response;
}
