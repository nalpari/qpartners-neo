import { NextResponse } from "next/server";

import { BATCH_FAILURE_THRESHOLD, batchState } from "@/lib/mass-mail/batch-state";

/**
 * Readiness probe — 운영자 / 모니터링이 사용.
 *
 * 검사 항목
 *   - massMailBatch: 대량메일 배치 cycle 이 연속 실패 중이 아닌지.
 *     BATCH_FAILURE_THRESHOLD 회 연속 실패하면 false → 503.
 *     정상 cycle 1회로 카운터가 리셋되므로, 원인 해소 후에는 재기동 없이 복구된다.
 *
 * 정상이면 200, 한 항목이라도 실패면 503 — fail-closed 기조 (Phase 2 PR #62 대응).
 *
 * 주의: 배치가 "아예 호출되지 않는" 상황은 이 probe 로 감지할 수 없다.
 * cycle 주기는 외부 스케줄러(POST /api/batch/mass-mail 호출)가 소유하므로
 * 호출 누락은 스케줄러 측 모니터링에서 감시해야 한다.
 */
export const runtime = "nodejs";

export function GET() {
  const consecutiveFailures = batchState.__massMailBatchConsecutiveFailures ?? 0;
  const massMailBatch = consecutiveFailures < BATCH_FAILURE_THRESHOLD;

  const ready = massMailBatch;
  const status = ready ? 200 : 503;

  return NextResponse.json(
    {
      ready,
      checks: {
        massMailBatch,
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
