import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuthRole } from "@/lib/auth";
import { decryptAutoLogin } from "@/lib/auto-login-crypto";
import { ConfigError } from "@/lib/errors";
import { COOKIE_NAME, signToken } from "@/lib/jwt";
import { fetchQspUserDetail } from "@/lib/qsp-member";
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
 */

const inboundQuerySchema = z.object({
  autoLoginParam1: z.string().min(1, "autoLoginParam1は必須です"),
  userTp: userTpSchema,
});

const JWT_MAX_AGE_SEC = 60 * 60 * 8; // 8시간 — 일반 로그인과 동일

export async function GET(request: NextRequest) {
  const LOG = "[GET /api/auth/auto-login/inbound]";
  const failRedirect = (reason: string) => {
    console.warn(LOG, "자동로그인 실패 폴백:", reason);
    return NextResponse.redirect(
      new URL("/login?error=auto_login_failed", request.url),
    );
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

    // 1. cipher 복호화 (자정 경계 fallback 내장)
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

    // 2. QSP userDetail (조회 전용) — pwd 없이 메타데이터만 조회
    const userDetailResult = await fetchQspUserDetail(userId, userTp, LOG, userId);
    if (!userDetailResult.ok) {
      return failRedirect(`user_detail_${userDetailResult.error.status}`);
    }
    const detail = userDetailResult.detail;

    // 3. authRole 결정 — /api/auth/login 과 동일 규칙 (DB 우선, 실패 시 최소 권한 폴백)
    let authRole: Awaited<ReturnType<typeof resolveAuthRole>>;
    try {
      authRole = await resolveAuthRole(userTp, detail.userId, detail.storeLvl);
    } catch (error) {
      console.error(LOG, "authRole 결정 실패, 최소 권한 폴백:", error);
      authRole = userTp === "ADMIN" ? "ADMIN"
        : userTp === "STORE" ? (detail.storeLvl === "1" ? "1ST_STORE" : "2ND_STORE")
        : userTp === "SEKO" ? "SEKO"
        : "GENERAL";
    }

    // 4. LoginUser 페이로드 구성
    //    - twoFactorVerified: true — 자동로그인은 2FA 스킵
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

    // 5. JWT 서명
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

    // 6. 홈 리다이렉트 + httpOnly 쿠키 (일반 로그인과 동일 속성)
    const response = NextResponse.redirect(new URL("/", request.url));
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
