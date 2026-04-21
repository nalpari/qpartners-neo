/**
 * 자동로그인 AES-256 암복호화 유틸리티
 *
 * 가이드 사양:
 *   plainUserId -> AES256 암호화(키: YYYYMMDD + AUTO_LOGIN_AES_KEY) -> cipherText
 *   encodeURIComponent(cipherText) -> URL_ENCODED_CIPHERTEXT
 *
 * 구현 세부:
 *   - AES-256-CBC, PKCS5Padding(Node 기본)
 *   - 키: SHA-256(keyString) → 32바이트
 *   - IV : SHA-256(keyString)의 앞 16바이트
 *   - keyString = YYYYMMDD(KST) + process.env.AUTO_LOGIN_AES_KEY
 *
 * 자정 경계: 복호화 실패 시 전일 키로 재시도하여 KST 00:00 전후 오차를 흡수한다.
 */

import crypto from "node:crypto";

import { ConfigError } from "@/lib/errors";

const ALGORITHM = "aes-256-cbc";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST(UTC+9) 기준 YYYYMMDD */
function formatKstDate(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getTodayKST(): string {
  return formatKstDate(new Date());
}

function getYesterdayKST(): string {
  return formatKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function deriveKey(keyString: string): Buffer {
  return crypto.createHash("sha256").update(keyString, "utf8").digest();
}

function deriveIv(keyString: string): Buffer {
  return deriveKey(keyString).subarray(0, 16);
}

function getAesSecret(): string {
  const envKey = process.env.AUTO_LOGIN_AES_KEY;
  if (!envKey) {
    throw new ConfigError("AUTO_LOGIN_AES_KEY 환경변수가 설정되지 않았습니다");
  }
  // NOTE: 키 길이 검증은 두지 않음 — AUTO_LOGIN_AES_KEY는 QSP와 합의된 고정 시크릿이며,
  // 실제 AES 키는 SHA-256(YYYYMMDD_KST + AUTO_LOGIN_AES_KEY)로 32바이트 확보됨.
  return envKey;
}

/** userId를 AES-256-CBC로 암호화 — Base64 출력 (URL 인코딩은 호출측 책임) */
export function encryptAutoLogin(userId: string): string {
  const keyString = getTodayKST() + getAesSecret();
  const key = deriveKey(keyString);
  const iv = deriveIv(keyString);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(userId, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

function decryptWithKey(cipherText: string, keyString: string): string {
  const key = deriveKey(keyString);
  const iv = deriveIv(keyString);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** AES-256-CBC 복호화 — 자정 경계 대응: 당일 키 실패 시 전일 키로 재시도 */
export function decryptAutoLogin(cipherText: string): string {
  const secret = getAesSecret();
  try {
    return decryptWithKey(cipherText, getTodayKST() + secret);
  } catch (todayError: unknown) {
    // 자정 직후(KST) 전일 키로 암호화된 cipher 유입은 정상 경로지만, cipher 포맷 오류·
    // 키 교체 실수·패딩 오라클 프로빙 등 실제 장애도 같은 분기로 흐름. 프로덕션에서도 컨텍스트 유지.
    console.warn("[auto-login-crypto] 당일 키 복호화 실패 — 전일 키로 재시도:", {
      errorName: todayError instanceof Error ? todayError.name : typeof todayError,
      errorMessage: todayError instanceof Error ? todayError.message : String(todayError),
    });
    try {
      return decryptWithKey(cipherText, getYesterdayKST() + secret);
    } catch (yesterdayError: unknown) {
      // 당일·전일 키 모두 실패 — 두 에러 모두 기록해 원인 추적 가능하게 유지
      console.error("[auto-login-crypto] 당일·전일 키 모두 복호화 실패:", {
        todayErrorName: todayError instanceof Error ? todayError.name : typeof todayError,
        todayErrorMessage: todayError instanceof Error ? todayError.message : String(todayError),
        yesterdayErrorName: yesterdayError instanceof Error ? yesterdayError.name : typeof yesterdayError,
        yesterdayErrorMessage: yesterdayError instanceof Error ? yesterdayError.message : String(yesterdayError),
      });
      throw yesterdayError;
    }
  }
}
