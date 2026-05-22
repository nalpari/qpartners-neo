/**
 * Outbound 자동로그인 AES-128-CBC 암호화 유틸 (Q.Partners → DESIGN(HANASYS) / Q.Order / Q.Musubi)
 *
 * 사양 (담당자 공유 사실, 2026-04-27 / 2026-05-21 키 통일):
 *   - 알고리즘 : AES/CBC/PKCS5Padding (Java) ↔ aes-128-cbc (Node.js, 기본 PKCS7 패딩 = 16B 블록에서 PKCS5 와 동일)
 *   - Key     : AUTO_LOGIN_AES_KEY 환경변수 (16 byte UTF-8, 예: `<16-byte-utf8-key>`)
 *               ※ 실제 키 값을 주석/커밋/리포지토리에 박지 않는다 — git 영구 노출 + inbound/outbound
 *                 단일 키 통일(2026-05-21) 후엔 "유일한 키" 노출이 됨. 키는 별도 보안 채널로만 공유.
 *               ※ Java 코드 함수명은 `encryptAes256` 이지만 SecretKeySpec 은 키 byte 길이로
 *                 알고리즘이 자동 결정되며, 16 byte → AES-128 이 실제 동작.
 *               ※ 2026-05-21 inbound 키 분리(`AUTO_LOGIN_INBOUND_AES_KEY`) 번복 — 외부 4개 시스템
 *                 (QSP/Q.Order/Q.Musubi/Design) 단일 공통 키 운영 사양에 맞춰 inbound 와 통일.
 *   - IV      : `YYYYMMDD` (KST) + `_autoL!!` = 16 byte (예: 20260427_autoL!!)
 *   - 평문    : 사용자 로그인 ID (string)
 *   - 출력    : Base64 ciphertext — URL 인코딩은 호출 측에서 (URL/URLSearchParams)
 *
 * 결과는 3사 동일 — 담당자 명시: "암호화 방식은 ORDER/QMUSUBI/DESIGN 다 동일".
 *
 * 보안 노트
 *   - IV 가 (KST 일자 + 고정 상수) 로 결정적이므로 같은 userId 가 같은 날 동일 cipher 가 됨.
 *     외부 3사가 본 사양을 그대로 검증하므로 결정적 IV 는 호환을 위한 의도된 동작.
 *   - 24h 단위 replay 윈도가 존재. 외부 3사 측 정책 변화 시 함께 보강 필요.
 *   - inbound 자동로그인(`auto-login-crypto.ts`) 과 동일 키 — 2026-05-21 통일.
 */

import crypto from "node:crypto";

import { ConfigError } from "@/lib/errors";

const ALGORITHM = "aes-128-cbc";
const KEY_LENGTH = 16;
const IV_LENGTH = 16;
/** IV = `YYYYMMDD`(8) + IV_SUFFIX(8) = 16 byte. 외부 3사가 검증하는 고정 상수. */
const IV_SUFFIX = "_autoL!!";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST(UTC+9) 기준 YYYYMMDD */
function formatKstDate(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// ⚠️ 키 캐싱 전략 불일치 메모 (2026-05-21 키 통일 후속):
//   inbound (`auto-login-crypto.ts`) 는 매 요청마다 process.env 를 읽지만,
//   outbound 는 프로세스 수명 동안 1회 캐싱한다 (cold path 비용 회피 + cipher 발급 빈도 차이).
//   결과적으로 운영 중 단일 공통 키 (AUTO_LOGIN_AES_KEY) 를 교체해도 outbound 만 구 키를 들고 있을 수 있다.
//   👉 키 로테이션 시 반드시 **프로세스 재시작 동반** (`docs/auto-login-inbound-guide.md` §3.3 참조).
let _cachedKey: Buffer | null = null;

function getOutboundAesKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const raw = process.env.AUTO_LOGIN_AES_KEY;
  if (!raw) {
    throw new ConfigError(
      "AUTO_LOGIN_AES_KEY 환경변수가 설정되지 않았습니다",
    );
  }
  // trim 하지 않음 — 외부 3사가 사용하는 정확한 byte 시퀀스를 유지해야 cipher 가 일치한다.
  // env 에 우연히 따옴표/공백/개행이 섞이면 cipher 가 silent 로 어긋나 자동로그인이 무한 실패.
  // length 검증으로 부팅 진단 비용 없이 첫 요청에서 즉시 차단.
  const buf = Buffer.from(raw, "utf8");
  if (buf.length !== KEY_LENGTH) {
    throw new ConfigError(
      "AUTO_LOGIN_AES_KEY 길이가 올바르지 않습니다 — 설정을 확인하세요",
    );
  }
  // 샘플 키 가드 부재 의도 (2026-04-30):
  //   외부 3사(HANASYS/Q.Order/Q.Musubi) 와 강제 공유되는 운영 키가 가이드 문서에 그대로 노출되어 있어
  //   "샘플 키 == 운영 키" 인 구조다. 우리 측이 거부할 권한이 없으므로 가드를 두지 않는다.
  //   운영 키 노출 위험은 가이드 문서 주의문/접근 통제로 흡수.
  _cachedKey = buf;
  return buf;
}

function buildIv(date: Date): Buffer {
  const iv = `${formatKstDate(date)}${IV_SUFFIX}`;
  // YYYYMMDD(8) + IV_SUFFIX(8) = 16 byte 가 보장돼야 함 — defense-in-depth.
  // 향후 IV_SUFFIX 가 멀티바이트 문자로 잘못 변경될 경우 즉시 부팅·요청 단계에서 차단.
  const byteLength = Buffer.byteLength(iv, "utf8");
  if (byteLength !== IV_LENGTH) {
    throw new ConfigError(
      `Outbound IV 길이 불일치 (${IV_LENGTH} byte 기대, 실제 ${byteLength} byte)`,
    );
  }
  return Buffer.from(iv, "utf8");
}

/**
 * 외부 3사(DESIGN/Q.Order/Q.Musubi)용 자동로그인 cipher 발급.
 *
 * @param userId 평문 사용자 로그인 ID
 * @param now    테스트용 시각 주입 (생략 시 현재 시각 — KST 일자 자동 도출)
 * @returns Base64 암호문 (URL 인코딩 필요 — 호출 측에서 처리)
 * @throws  ConfigError — 환경변수 누락/길이 불일치
 * @throws  Error       — userId 가 빈 문자열
 */
export function encryptOutboundCipher(userId: string, now: Date = new Date()): string {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("userId 가 비어 있습니다");
  }

  const key = getOutboundAesKey();
  const iv = buildIv(now);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(userId, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}
