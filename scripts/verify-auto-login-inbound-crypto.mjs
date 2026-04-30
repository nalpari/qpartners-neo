/**
 * Inbound 자동로그인 AES-128-CBC byte-level 등가성 검증 스크립트.
 *
 * 목적: 2026-04-30 inbound 사양 재정렬 — outbound `auto-login-outbound-crypto.ts` 와
 * 알고리즘·IV·평문·출력이 byte-level 로 일치함을 자체 재현으로 증명.
 *
 * 검증 항목 5종:
 *   (A) 자바 원본 샘플 일치    : T01 + 20260424_autoL!! → pQE3A9NO+KCt6q2hD/Bhzw==
 *   (B) Q.Musubi 사용자 샘플    : 201T01 + 20260424_autoL!! → GpvgC+3aY/fPBItoF6+Cdg==
 *   (C) round-trip 등가성       : encrypt → decrypt → 평문 일치
 *   (D) 전일 IV fallback 시뮬   : 어제 IV 로 만든 cipher 가 어제 키로 풀림 (자정 경계 흡수)
 *   (E) 격리 검증              : 다른 키로 복호 시도 시 padding 실패
 *
 * 모듈을 직접 import 하지 않고 사양 자체를 인라인 재현 — 즉 모듈이 동일 사양을 구현하면
 * 운영 동작도 동일함을 증명.
 *
 * 실행:
 *   - 알고리즘 로직만 검증 (C/D/E):     node scripts/verify-auto-login-inbound-crypto.mjs
 *   - 자바 원본 byte-level 일치 포함:    VERIFY_SAMPLE_KEY=<docs §4 의 샘플 키> node scripts/verify-auto-login-inbound-crypto.mjs
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-128-cbc";
const IV_SUFFIX = "_autoL!!"; // outbound 와 동일 (2026-04-30 Q2 결정)

/**
 * ⚠️ 검증 전용 샘플 키 — 운영 환경에 절대 사용 금지.
 *
 * 본 스크립트는 (A)/(B) 자바 원본 샘플 cipher 와의 byte-level 일치를 검증하기 위해
 * 실행자에게 **샘플 키를 env 로 주입**받는다. 코드에 키 리터럴을 박지 않는 이유:
 *   - git history 영구 기록 방지 (소스 트리 grep 으로 노출되지 않게).
 *   - 실수로 운영 .env 에 그대로 복사되는 경로를 차단 (운영 코드의 `auto-login-crypto.ts`
 *     도 `timingSafeEqual` 가드로 동일 값 거부하지만, 본 파일에서도 같은 위생 기준 적용).
 *
 * 검증 시 사용할 값은 `docs/auto-login-inbound-guide.md` §4 "검증 샘플" 표를 참조.
 * env 미설정 시 (A)/(B) 는 SKIP, (C)/(D)/(E) 만 임시 랜덤 키로 알고리즘 로직 검증.
 *
 * 사용 예:
 *   VERIFY_SAMPLE_KEY=<docs §4 의 샘플 키> node scripts/verify-auto-login-inbound-crypto.mjs
 */
const JAVA_SAMPLE_VERIFY_KEY = process.env.VERIFY_SAMPLE_KEY ?? null;
if (JAVA_SAMPLE_VERIFY_KEY !== null && Buffer.byteLength(JAVA_SAMPLE_VERIFY_KEY, "utf8") !== 16) {
  console.error(
    `VERIFY_SAMPLE_KEY 길이 오류 — 16 byte 필요, 실제 ${Buffer.byteLength(JAVA_SAMPLE_VERIFY_KEY, "utf8")} byte`,
  );
  process.exit(2);
}
/** (A)/(B) skip 시 (C)/(D)/(E) 알고리즘 로직 검증용 임시 16 byte 랜덤 키 */
const ROUNDTRIP_KEY = JAVA_SAMPLE_VERIFY_KEY ?? crypto.randomBytes(8).toString("hex");

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

// (A)(B) 자바 원본 샘플 — VERIFY_SAMPLE_KEY env 가 있을 때만 실행 (샘플 키는 env 로 주입).
if (JAVA_SAMPLE_VERIFY_KEY !== null) {
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
} else {
  results.push({
    case: "A. 자바 샘플 (T01)",
    expected: "VERIFY_SAMPLE_KEY 미설정 — SKIP",
    got: "SKIP",
    pass: true,
    skipped: true,
  });
  results.push({
    case: "B. Q.Musubi 샘플 (201T01)",
    expected: "VERIFY_SAMPLE_KEY 미설정 — SKIP",
    got: "SKIP",
    pass: true,
    skipped: true,
  });
}

// (C) round-trip — 알고리즘 로직 검증이라 샘플 키 없어도 임시 랜덤 키로 통과 가능.
{
  const userId = "1301011";
  const today = "20260430";
  const cipher = encrypt(userId, today, ROUNDTRIP_KEY);
  const restored = decrypt(cipher, today, ROUNDTRIP_KEY);
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
  const cipher = encrypt(userId, yesterday, ROUNDTRIP_KEY);
  const restored = decrypt(cipher, yesterday, ROUNDTRIP_KEY);
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
  const cipher = encrypt(userId, "20260430", ROUNDTRIP_KEY);
  // ROUNDTRIP_KEY 와 충돌하지 않도록 두 번째 랜덤 키 생성 (ROUNDTRIP_KEY 가 env 주입이든 랜덤이든).
  let wrongKey = crypto.randomBytes(8).toString("hex");
  while (wrongKey === ROUNDTRIP_KEY) {
    wrongKey = crypto.randomBytes(8).toString("hex");
  }
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
const anySkipped = results.some((r) => r.skipped === true);

console.log("\n=== Inbound AES-128-CBC byte-level 등가성 검증 ===\n");
for (const r of results) {
  const mark = r.skipped ? "SKIP" : r.pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${r.case}`);
  console.log(`       expected: ${r.expected}`);
  console.log(`       got     : ${r.got}`);
}
if (anySkipped) {
  console.log(
    "\n※ (A)/(B) 자바 원본 byte-level 검증은 SKIP 되었습니다. " +
      "VERIFY_SAMPLE_KEY env 를 설정해서 다시 실행하면 검증이 활성화됩니다 " +
      "(샘플 키 값은 docs/auto-login-inbound-guide.md §4 참조).",
  );
}
console.log(
  `\n결과: ${
    allPass
      ? anySkipped
        ? "PARTIAL PASS — 알고리즘 로직 OK, 자바 원본 byte-level 검증은 SKIP"
        : "ALL PASS — outbound 사양과 byte-level 일치"
      : "FAIL — 사양 어긋남"
  }\n`,
);

process.exit(allPass ? 0 : 1);
