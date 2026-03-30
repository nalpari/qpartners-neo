import { randomInt, createHash } from "crypto";

/** 6자리 인증번호 생성 (100000~999999, 암호학적 안전 난수) */
export function generateTwoFactorCode(): string {
  return String(randomInt(100000, 1000000));
}

/** OTP 코드 SHA-256 해시 (DB 저장용) */
export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
