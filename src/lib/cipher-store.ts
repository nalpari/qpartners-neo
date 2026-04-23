/**
 * Cipher 1회용 소진 추적 — Replay Attack 방어
 *
 * 자동로그인 cipher가 한 번 사용되면 해시를 저장하고,
 * 동일 cipher 재사용 시 거부한다.
 *
 * - 키: SHA-256(cipher) — 원본 cipher를 메모리에 보관하지 않음
 * - TTL: 25시간 — 일별 키 로테이션(24h) + 자정 경계 여유 1시간
 * - 인메모리 Map 기반 (rate-limit.ts와 동일 한계: 다중 인스턴스 비공유)
 * - 분산 환경 전환 시 Redis SET + EX 로 대체
 */

import crypto from "node:crypto";

interface CipherEntry {
  consumedAt: number;
}

const store = new Map<string, CipherEntry>();

/** cipher 유효 기간 — 일별 키 로테이션(24h) + 자정 경계 여유 */
const CIPHER_TTL_MS = 25 * 60 * 60 * 1000;

// 하루 최대 자동로그인 수 추정(3사 × 수백 사용자) 대비 충분한 여유.
// rate-limit(10K)보다 크게 잡는 이유: cipher TTL(25h)이 rate-limit 윈도우(1분)보다 길어 누적량이 많음.
const MAX_STORE_SIZE = 50_000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function hashCipher(cipher: string): string {
  return crypto.createHash("sha256").update(cipher, "utf8").digest("hex");
}

function cleanup(force = false): void {
  const now = Date.now();
  if (!force && now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now - entry.consumedAt >= CIPHER_TTL_MS) store.delete(key);
  }
}

/**
 * cipher가 이미 소진되었는지 확인하고, 미소진이면 소진 등록한다.
 * @returns true면 새 cipher(허용), false면 이미 사용됨(거부)
 */
export function consumeCipher(cipher: string): boolean {
  cleanup();

  // store overflow — fail-closed: 소진 여부를 신뢰할 수 없으므로 거부
  if (store.size >= MAX_STORE_SIZE) {
    cleanup(true);
    if (store.size >= MAX_STORE_SIZE) {
      console.warn(
        `[cipher-store] store overflow (${store.size}) — fail-closed deny`,
      );
      return false;
    }
  }

  const hash = hashCipher(cipher);

  if (store.has(hash)) {
    return false;
  }

  store.set(hash, { consumedAt: Date.now() });
  return true;
}
