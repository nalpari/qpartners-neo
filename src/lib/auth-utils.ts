import { randomInt, createHmac } from "crypto";

/** 6자리 인증번호 생성 (100000~999999, 암호학적 안전 난수) */
export function generateTwoFactorCode(): string {
  return String(randomInt(100000, 1000000));
}

/** OTP 코드 HMAC-SHA256 해시 (DB 저장용, salt 없는 SHA-256 대비 레인보우 테이블 방어) */
export function hashOtp(code: string): string {
  const secret = process.env.JWT_SECRET ?? "qpartners-neo-otp-secret";
  return createHmac("sha256", secret).update(code).digest("hex");
}
