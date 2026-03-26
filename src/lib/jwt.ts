import { SignJWT, jwtVerify } from "jose";

import { loginUserSchema } from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET 환경변수가 설정되지 않았습니다");
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
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
