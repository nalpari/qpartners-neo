/**
 * 인메모리 rate limiter — 키 기반 요청 제한
 * 서버리스 환경에서는 인스턴스 간 공유되지 않지만,
 * 단일 인스턴스 내에서 열거 공격을 1차 방어합니다.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;

// 5분마다 만료된 엔트리 정리
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(force = false) {
  const now = Date.now();
  if (!force && now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

/**
 * rate limit 체크
 * @param key - rate limit 키 (예: `pw-reset:${ip}`)
 * @param limit - 윈도우 내 최대 요청 수
 * @param windowMs - 시간 윈도우 (밀리초)
 * @returns true면 허용, false면 제한 초과
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  if (limit < 1 || windowMs < 1) {
    throw new Error(`[rate-limit] invalid params: limit=${limit}, windowMs=${windowMs}`);
  }
  cleanup();
  if (store.size > MAX_STORE_SIZE) {
    console.warn(`[rate-limit] store size exceeded ${MAX_STORE_SIZE} (${store.size}), forcing cleanup`);
    cleanup(true);
    // cleanup 후에도 초과 시 가장 오래된 엔트리부터 제거
    if (store.size > MAX_STORE_SIZE) {
      const excess = store.size - MAX_STORE_SIZE;
      let removed = 0;
      for (const k of store.keys()) {
        if (removed >= excess) break;
        store.delete(k);
        removed++;
      }
      console.warn(`[rate-limit] evicted ${removed} oldest entries after cleanup`);
    }
  }

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > limit) return false;
  return true;
}
