/**
 * 대량메일 배치 런타임 상태 (프로세스 로컬)
 *
 * `auto-retry-batch` 와 `/api/health` 가 공유하는 값만 담는다.
 * 별도 모듈로 분리한 이유: health probe 가 `auto-retry-batch` 를 import 하면
 * send-processor → nodemailer/QSP 체인까지 끌려와 probe 가 무거워진다.
 *
 * globalThis 보관 — dev HMR 로 모듈이 재-import 돼도 카운터가 리셋되지 않게.
 */

/**
 * cycle 이 이 횟수만큼 연속 실패하면 `/api/health` 를 503 으로 노출한다.
 * 같은 원인이 반복되는 상황을 운영자가 즉시 인지하도록 하는 fail-closed 장치.
 * 정상 cycle 1회로 카운터가 리셋되므로 일시 장애는 자가복구된다.
 */
export const BATCH_FAILURE_THRESHOLD = 5;

type MassMailBatchGlobals = {
  __massMailBatchRunning?: boolean;
  __massMailBatchConsecutiveFailures?: number;
};

export const batchState = globalThis as unknown as MassMailBatchGlobals;
