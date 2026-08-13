import { NextResponse } from "next/server";

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

import { ConfigError } from "@/lib/errors";
import { loginUserSchema } from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ConfigError("JWT_SECRET 환경변수가 설정되지 않았습니다");
  }
  return new TextEncoder().encode(secret);
};

const TOKEN_EXPIRY = "8h";
const COOKIE_NAME = "qp-auth-token";

/** JWT 토큰 생성 */
export async function signToken(user: LoginUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret());
}

/** JWT 토큰 검증 + 사용자 정보 반환 */
export async function verifyToken(token: string): Promise<LoginUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const parsed = loginUserSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("[verifyToken] JWT payload 스키마 불일치:", parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (error) {
    // 환경변수 설정 에러는 반드시 전파 — 무음 실패 방지
    if (error instanceof ConfigError) {
      console.error("[verifyToken] CRITICAL 설정 에러:", error);
      throw error;
    }
    // JWT 검증 실패(만료, 서명 불일치 등)는 정상 흐름 — 로깅 불필요
    const isExpectedJwtError =
      error instanceof joseErrors.JWTExpired ||
      error instanceof joseErrors.JWSSignatureVerificationFailed ||
      error instanceof joseErrors.JWSInvalid ||
      error instanceof joseErrors.JWTClaimValidationFailed;
    if (!isExpectedJwtError) {
      console.error("[verifyToken] unexpected error:", error);
    }
    return null;
  }
}

/** 요청 쿠키에서 JWT 검증 + 사용자 반환. 미인증 시 null. */
export async function getUserFromRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): Promise<LoginUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** 인증 쿠키 만료 옵션 (logout/withdraw 라우트와 동일 값). */
const COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

/**
 * 세션 결손(재로그인 필요) 401 응답 — 인증 쿠키를 함께 삭제한다.
 *
 * 쿠키를 남긴 채 401 만 반환하면 미들웨어는 JWT 가 유효하므로 통과시키고 API 만 거부해,
 * 화면은 "로그인돼 있는데 아무것도 못 하는" 상태로 고착된다. 게다가 axios 인터셉터가
 * 401 에서 AUTH_FLAG 를 지워 GNB 만 비로그인으로 바뀌므로 사용자는 새로고침으로 벗어날 수 없다.
 * 쿠키를 지워 다음 요청이 정상 로그인 흐름을 타게 한다.
 */
export function sessionInvalidResponse(message: string): NextResponse {
  const response = NextResponse.json({ error: message }, { status: 401 });
  response.cookies.set(COOKIE_NAME, "", COOKIE_CLEAR_OPTIONS);
  return response;
}

export { COOKIE_NAME };
