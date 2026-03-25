import { SignJWT, jwtVerify } from "jose";

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
    return {
      userId: payload.userId as string,
      userNm: payload.userNm as string | null,
      userTp: payload.userTp as string,
      compCd: payload.compCd as string | null,
      compNm: payload.compNm as string | null,
      email: payload.email as string | null,
      deptNm: payload.deptNm as string | null,
      authCd: payload.authCd as string | null,
      storeLvl: payload.storeLvl as string | null,
      statCd: payload.statCd as string | null,
    };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
