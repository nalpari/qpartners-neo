/**
 * 자동로그인 AES-256 암복호화 유틸리티
 *
 * Q.Order / Q.Musubi 자동로그인용.
 * QSP EncryptUtil.encryptAes256 호환 — AES/CBC/PKCS5Padding, SHA-256 키 파생.
 *
 * 키 조합: YYYYMMDD(KST) + AUTO_LOGIN_AES_KEY 환경변수
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-cbc";

/** KST(UTC+9) 기준 YYYYMMDD 문자열 */
function getTodayKST(): string {
  const now = new Date();
  // KST = UTC + 9시간
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** 키 문자열 → SHA-256 → 32바이트 AES 키 */
function deriveKey(keyString: string): Buffer {
  return crypto.createHash("sha256").update(keyString, "utf8").digest();
}

/** SHA-256 해시의 앞 16바이트를 IV로 사용 */
function deriveIv(keyString: string): Buffer {
  return deriveKey(keyString).subarray(0, 16);
}

function getAesKey(): string {
  const envKey = process.env.AUTO_LOGIN_AES_KEY;
  if (!envKey) {
    throw new Error("AUTO_LOGIN_AES_KEY 환경변수가 설정되지 않았습니다");
  }
  return envKey;
}

/** userId를 AES-256-CBC로 암호화 (Base64 출력) */
export function encryptAutoLogin(userId: string): string {
  const keyString = getTodayKST() + getAesKey();
  const key = deriveKey(keyString);
  const iv = deriveIv(keyString);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(userId, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

/**
 * AES-256-CBC 복호화 (자정 경계 대응: 당일 키 실패 시 전일 키로 재시도)
 * 수신 측 구현 시 사용 — 현재는 발신(encrypt)만 사용
 */
export function decryptAutoLogin(cipherText: string): string {
  const aesKey = getAesKey();

  // 1차: 당일 키로 시도
  const todayKey = getTodayKST() + aesKey;
  try {
    return decryptWithKey(cipherText, todayKey);
  } catch {
    // 2차: 전일 키로 재시도 (자정 경계 대응)
    const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
    const y = yesterday.getUTCFullYear();
    const m = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const d = String(yesterday.getUTCDate()).padStart(2, "0");
    const yesterdayKey = `${y}${m}${d}` + aesKey;
    return decryptWithKey(cipherText, yesterdayKey);
  }
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
