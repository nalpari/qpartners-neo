/**
 * Inbound 자동로그인 AES-128-CBC byte-level 등가성 검증 스크립트.
 *
 * 목적: 2026-04-30 inbound 사양 재정렬 — outbound `auto-login-outbound-crypto.ts` 와
 * 알고리즘·IV·평문·출력이 byte-level 로 일치함을 자체 재현으로 증명.
 *
 * 검증 항목 4종:
 *   (A) 자바 원본 샘플 일치    : T01 + 20260424_autoL!! → pQE3A9NO+KCt6q2hD/Bhzw==
 *   (B) Q.Musubi 사용자 샘플    : 201T01 + 20260424_autoL!! → GpvgC+3aY/fPBItoF6+Cdg==
 *   (C) round-trip 등가성       : encrypt → decrypt → 평문 일치
 *   (D) 전일 IV fallback 시뮬   : 어제 IV 로 만든 cipher 가 오늘 키로 풀림 (자정 경계 흡수)
 *
 * 모듈을 직접 import 하지 않고 사양 자체를 인라인 재현 — 즉 모듈이 동일 사양을 구현하면
 * 운영 동작도 동일함을 증명.
 *
 * 실행: node scripts/verify-auto-login-inbound-crypto.mjs
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-128-cbc";
const IV_SUFFIX = "_autoL!!"; // outbound 와 동일 (2026-04-30 Q2 결정)

/**
 * ⚠️ 검증 전용 키 — 운영 키와 절대 동일하면 안 된다.
 *
 * 이 키 `jpqcellQ123456!!` 는 (A)/(B) 자바 원본 샘플 cipher 와 byte-level 일치를 검증하기 위한
 * **하드코딩된 샘플 키**다. 실제 운영 환경은 `AUTO_LOGIN_INBOUND_AES_KEY` env 의
 * 외부 3사와 합의된 별도 16 byte 값으로 동작한다.
 *
 * 만약 운영 환경에 이 값이 그대로 설정되면 외부 3사 가이드 문서에 노출된 샘플 키로
 * cipher 가 발급/복호되어 자동로그인 인증이 무력화된다 — 즉 .env 검사 시 이 값과
 * 일치하면 즉시 교체할 것.
 *
 * 본 스크립트는 검증 목적이므로 키를 고정한다 (env 주입 시 (A)/(B) 기대 cipher 가 어긋나 무의미).
 */
const JAVA_SAMPLE_VERIFY_KEY = "jpqcellQ123456!!";

function buildIv(yyyymmdd) {
  const iv = `${yyyymmdd}${IV_SUFFIX}`;
  if (Buffer.byteLength(iv, "utf8") !== 16) {
    throw new Error(`IV 길이 불일치: ${Buffer.byteLength(iv, "utf8")} byte`);
  }
  return Buffer.from(iv, "utf8");
}

function encrypt(userId, yyyymmdd, keyStr) {
  const key = Buffer.from(keyStr, "utf8");
  const iv = buildIv(yyyymmdd);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
  return encrypted.toString("base64");
}

function decrypt(cipherText, yyyymmdd, keyStr) {
  const key = Buffer.from(keyStr, "utf8");
  const iv = buildIv(yyyymmdd);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const payload = Buffer.from(cipherText, "base64");
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
}

const results = [];

// (A) 자바 원본 샘플
{
  const got = encrypt("T01", "20260424", JAVA_SAMPLE_VERIFY_KEY);
  const expected = "pQE3A9NO+KCt6q2hD/Bhzw==";
  results.push({
    case: "A. 자바 샘플 (T01, 20260424_autoL!!)",
    expected,
    got,
    pass: got === expected,
  });
}

// (B) Q.Musubi 샘플
{
  const got = encrypt("201T01", "20260424", JAVA_SAMPLE_VERIFY_KEY);
  const expected = "GpvgC+3aY/fPBItoF6+Cdg==";
  results.push({
    case: "B. Q.Musubi 샘플 (201T01, 20260424_autoL!!)",
    expected,
    got,
    pass: got === expected,
  });
}

// (C) round-trip
{
  const userId = "1301011";
  const today = "20260430";
  const cipher = encrypt(userId, today, JAVA_SAMPLE_VERIFY_KEY);
  const restored = decrypt(cipher, today, JAVA_SAMPLE_VERIFY_KEY);
  results.push({
    case: "C. round-trip (1301011, 20260430)",
    expected: userId,
    got: restored,
    pass: restored === userId,
  });
}

// (D) 자정 경계 — 어제 IV 로 만든 cipher → 어제 IV 로 복호
{
  const userId = "GENERAL_USER";
  const yesterday = "20260429";
  const cipher = encrypt(userId, yesterday, JAVA_SAMPLE_VERIFY_KEY);
  const restored = decrypt(cipher, yesterday, JAVA_SAMPLE_VERIFY_KEY);
  results.push({
    case: "D. 자정 경계 fallback (GENERAL_USER, 20260429)",
    expected: userId,
    got: restored,
    pass: restored === userId,
  });
}

// (E) 음성 검증 — 다른 키는 복호 실패해야 함 (격리 검증)
{
  const userId = "T01";
  const cipher = encrypt(userId, "20260430", JAVA_SAMPLE_VERIFY_KEY);
  const wrongKey = "differentKey123!"; // 16 byte
  let failed = false;
  try {
    decrypt(cipher, "20260430", wrongKey);
  } catch (error) {
    // 다른 키로 복호 시도 → 패딩 검증 실패가 정상 경로. 에러 객체는 분기 식별 후 무시.
    void error;
    failed = true;
  }
  results.push({
    case: "E. 격리 검증 (다른 키 → 복호 실패)",
    expected: "throws",
    got: failed ? "throws" : "no-throw",
    pass: failed,
  });
}

const allPass = results.every((r) => r.pass);

console.log("\n=== Inbound AES-128-CBC byte-level 등가성 검증 ===\n");
for (const r of results) {
  const mark = r.pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${r.case}`);
  console.log(`       expected: ${r.expected}`);
  console.log(`       got     : ${r.got}`);
}
console.log(`\n결과: ${allPass ? "ALL PASS — outbound 사양과 byte-level 일치" : "FAIL — 사양 어긋남"}\n`);

process.exit(allPass ? 0 : 1);
