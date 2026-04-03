import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

import { loginUserSchema } from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";

class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ConfigError";
  }
}

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
    if (!parsed.success) return null;
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

export { COOKIE_NAME };
