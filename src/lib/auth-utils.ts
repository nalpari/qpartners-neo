import { randomInt, createHmac } from "crypto";

/** 6자리 인증번호 생성 (100000~999999, 암호학적 안전 난수) */
export function generateTwoFactorCode(): string {
  return String(randomInt(100000, 1000000));
}

/** OTP 코드 HMAC-SHA256 해시 (DB 저장용, JWT와 별도 키 사용) */
export function hashOtp(code: string): string {
  const secret = process.env.OTP_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("OTP_SECRET 또는 JWT_SECRET 환경변수가 필요합니다");
  }
  return createHmac("sha256", secret).update(code).digest("hex");
}
