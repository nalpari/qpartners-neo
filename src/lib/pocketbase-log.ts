/**
 * PocketBase 배치 로그 기록 — 대량메일 배치 cycle 결과를 원격 PocketBase 에 남긴다.
 *
 * 서버 stdout 로그는 인스턴스별로 흩어지고 재시작 시 유실되므로,
 * cycle 결과만 별도 컬렉션(`mass_mail_batch_logs`)에 축적해 조회 가능하게 한다.
 *
 * 인증: PocketBase 슈퍼유저 로그인(토큰은 모듈 스코프 캐시, 401/403 시 1회 재인증 후 재시도).
 * 컬렉션 API rule 은 전부 슈퍼유저 전용이므로 외부에서 위조 레코드를 넣을 수 없다.
 *
 * 이 모듈은 **절대 throw 하지 않는다** — 로깅 실패가 배치 자체를 실패시키면 안 되므로
 * 모든 에러를 console.error 로 흡수한다. env 미설정 시에는 경고 후 no-op.
 */

import { z } from "zod";

import type { BatchCycleResult } from "@/lib/mass-mail/auto-retry-batch";

const LOG_TAG = "[pocketbase-log]";
const COLLECTION = "mass_mail_batch_logs";
/** PocketBase 응답 대기 상한 — 원격이 행 걸려도 배치 락 해제를 지연시키지 않는다. */
const TIMEOUT_MS = 5_000;

/** cycle 결과 + 락 홀더. 예외 경로에서는 결과 필드가 없으므로 Partial. */
export type BatchLogEntry = Partial<BatchCycleResult> & {
  holder: string;
  ok: boolean;
};

const authSchema = z.object({ token: z.string().min(1) });

interface PocketBaseConfig {
  url: string;
  email: string;
  password: string;
}

let cachedToken: string | null = null;
let warnedMissingConfig = false;

function getConfig(): PocketBaseConfig | null {
  const url = process.env.POCKETBASE_URL?.trim();
  const email = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!url || !email || !password) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        `${LOG_TAG} POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD 미설정 — 배치 로그 원격 기록 비활성화`,
      );
    }
    return null;
  }
  return { url, email, password };
}

async function authenticate(cfg: PocketBaseConfig): Promise<string> {
  const res = await fetch(
    `${cfg.url}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: cfg.email, password: cfg.password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new Error(`슈퍼유저 인증 실패 (status=${res.status})`);
  }
  const parsed = authSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`인증 응답 스키마 불일치: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data.token;
}

function createRecord(
  cfg: PocketBaseConfig,
  token: string,
  entry: BatchLogEntry,
): Promise<Response> {
  return fetch(`${cfg.url}/api/collections/${COLLECTION}/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(entry),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** cycle 결과 1건 기록. 실패해도 throw 하지 않는다. */
export async function logBatchCycle(entry: BatchLogEntry): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return;

  try {
    cachedToken ??= await authenticate(cfg);
    let res = await createRecord(cfg, cachedToken, entry);
    if (res.status === 401 || res.status === 403) {
      // 토큰 만료/무효 — 재인증 후 1회만 재시도.
      cachedToken = await authenticate(cfg);
      res = await createRecord(cfg, cachedToken, entry);
    }
    if (!res.ok) {
      cachedToken = null;
      console.error(`${LOG_TAG} 레코드 생성 실패 (status=${res.status})`);
    }
  } catch (error: unknown) {
    cachedToken = null;
    console.error(`${LOG_TAG} 기록 실패:`, error);
  }
}
