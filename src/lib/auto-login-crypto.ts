/**
 * Inbound 자동로그인 AES-128-CBC 복호화 유틸 (외부 3사 → Q.Partners-neo)
 *
 * 사양 (2026-04-30 outbound 사양 미러링으로 재정렬):
 *   - 알고리즘 : AES/CBC/PKCS5Padding (Java) ↔ aes-128-cbc (Node.js, 기본 PKCS7 = 16B 블록에서 PKCS5 와 동등)
 *   - Key     : AUTO_LOGIN_INBOUND_AES_KEY 환경변수 (16 byte UTF-8)
 *               ※ outbound 키(AUTO_LOGIN_OUTBOUND_AES_KEY) 와 분리 운영 —
 *                 한쪽 compromise 시 다른 방향 자동로그인에 영향 격리 (2026-04-30 Q1 결정).
 *   - IV      : `YYYYMMDD` (KST) + `_autoL!!` = 16 byte (예: 20260430_autoL!!)
 *               ※ outbound 와 동일 — 외부 3사 가이드 양방향 통일 (2026-04-30 Q2 결정).
 *   - 평문    : 사용자 로그인 ID (string, ADMIN/STORE/SEKO=loginId, GENERAL=email)
 *   - 입력    : Base64 ciphertext (URL 디코딩은 Next.js 쿼리 파서가 자동 수행)
 *
 * 자정 경계 (KST) 처리:
 *   - 당일 IV 복호화 실패 시 전일 IV 로 1회 재시도.
 *   - 외부 3사가 KST 23:59 직전에 발급해 KST 00:01 에 도착한 cipher 흡수.
 *   - 키는 날짜 무관 (env 고정) — IV 만 전일로 교체.
 *
 * 변경 이력:
 *   - 2026-04-22 v1: 초안 — AES-256-CBC + SHA-256(YYYYMMDD_KST + AUTO_LOGIN_AES_KEY) + 랜덤 IV (Base64(IV‖CT))
 *   - 2026-04-30 v2: 재구현 — outbound `auto-login-outbound-crypto.ts` 와 알고리즘·IV·평문·출력 통일.
 *     키만 분리 (`AUTO_LOGIN_INBOUND_AES_KEY`). 3사 측 inbound encrypt 미구현 시점이라 호환 부담 0.
 *
 * 보안 노트:
 *   - IV 가 (KST 일자 + 고정 상수) 로 결정적 → 같은 userId 가 같은 날 동일 cipher 가 됨.
 *     이는 외부 3사 호환을 위한 의도된 동작이며, replay 표면이 24h 단위로 노출됨.
 *   - 받는 측 1회용 차단을 두지 않음 (2026-04-30 결정) — outbound 받는 측 (외부 3사) 와 동일 정책으로
 *     통일. 같은 사용자가 같은 날 여러 번 inbound 진입을 정상 통과시킨다.
 *     받아들인 위험: cipher 탈취 시 24h 내 재사용 가능 (외부 3사 inbound 도 동일 위험).
 *     필요 시 평문에 nonce/타임스탬프를 포함하는 사양 확장으로 강화 가능 (현재 Out of Scope).
 *   - outbound 와 키가 다르므로 outbound 발급 cipher 를 본 모듈로 복호 불가 (의도된 분리).
 */

import crypto from "node:crypto";

import { ConfigError } from "@/lib/errors";

const ALGORITHM = "aes-128-cbc";
const KEY_LENGTH = 16;
const IV_LENGTH = 16;
/** IV = `YYYYMMDD`(8) + IV_SUFFIX(8) = 16 byte. outbound 와 동일 상수 — 양방향 가이드 통일. */
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

let _cachedKey: Buffer | null = null;

function getInboundAesKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const raw = process.env.AUTO_LOGIN_INBOUND_AES_KEY;
  if (!raw) {
    throw new ConfigError(
      "AUTO_LOGIN_INBOUND_AES_KEY 환경변수가 설정되지 않았습니다",
    );
  }
  // trim 하지 않음 — 외부 3사가 사용하는 정확한 byte 시퀀스를 유지해야 cipher 가 일치.
  // env 에 우연히 따옴표/공백/개행이 섞이면 cipher 가 silent 로 어긋나 자동로그인이 무한 실패.
  // length 검증으로 부팅 진단 비용 없이 첫 요청에서 즉시 차단.
  const buf = Buffer.from(raw, "utf8");
  if (buf.length !== KEY_LENGTH) {
    throw new ConfigError(
      "AUTO_LOGIN_INBOUND_AES_KEY 길이가 올바르지 않습니다 — 16 byte 필요",
    );
  }
  _cachedKey = buf;
  return buf;
}

function buildIv(date: Date): Buffer {
  const iv = `${formatKstDate(date)}${IV_SUFFIX}`;
  // YYYYMMDD(8) + IV_SUFFIX(8) = 16 byte 보장 — defense-in-depth.
  // IV_SUFFIX 가 멀티바이트 문자로 잘못 변경될 경우 즉시 차단.
  const byteLength = Buffer.byteLength(iv, "utf8");
  if (byteLength !== IV_LENGTH) {
    throw new ConfigError(
      `Inbound IV 길이 불일치 (${IV_LENGTH} byte 기대, 실제 ${byteLength} byte)`,
    );
  }
  return Buffer.from(iv, "utf8");
}

function decryptWithIv(payload: Buffer, iv: Buffer, key: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([
    decipher.update(payload),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * 외부 3사(HANASYS/Q.Order/Q.Musubi) 자동로그인 cipher 복호화.
 *
 * @param cipherText Base64 ciphertext (Next.js 쿼리 파서가 URL 디코딩 자동 수행)
 * @returns 평문 사용자 로그인 ID (ADMIN/STORE/SEKO=loginId, GENERAL=email)
 * @throws ConfigError — 환경변수 누락 / 키 길이 불일치 / IV 길이 불일치
 * @throws Error       — 당일·전일 IV 양쪽 모두 복호화 실패 (cipher 위변조·키 불일치 등)
 */
export function decryptAutoLogin(cipherText: string): string {
  const key = getInboundAesKey();
  const payload = Buffer.from(cipherText, "base64");

  try {
    return decryptWithIv(payload, buildIv(new Date()), key);
  } catch (todayError: unknown) {
    // 자정 직후(KST) 전일 IV 로 암호화된 cipher 유입은 정상 경로지만, 포맷 오류·키 교체 실수·
    // 패딩 오라클 프로빙 등 실제 장애도 같은 분기로 흐름. 프로덕션에서도 컨텍스트 유지.
    console.warn("[auto-login-crypto] 당일 IV 복호화 실패 — 전일 IV 로 재시도:", {
      errorName: todayError instanceof Error ? todayError.name : typeof todayError,
      errorMessage: todayError instanceof Error ? todayError.message : String(todayError),
    });
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      return decryptWithIv(payload, buildIv(yesterdayDate), key);
    } catch (yesterdayError: unknown) {
      console.error("[auto-login-crypto] 당일·전일 IV 모두 복호화 실패:", {
        todayErrorName: todayError instanceof Error ? todayError.name : typeof todayError,
        todayErrorMessage: todayError instanceof Error ? todayError.message : String(todayError),
        yesterdayErrorName:
          yesterdayError instanceof Error ? yesterdayError.name : typeof yesterdayError,
        yesterdayErrorMessage:
          yesterdayError instanceof Error ? yesterdayError.message : String(yesterdayError),
      });
      throw yesterdayError;
    }
  }
}
