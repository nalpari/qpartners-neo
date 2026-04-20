import { NextResponse } from "next/server";

/**
 * Readiness probe — 운영자 / 모니터링이 사용.
 *
 * 검사 항목
 *   - massMailBatch: 대량메일 자동 재시도 setInterval 타이머가 globalThis 에 등록되어 있는지.
 *     기동 시 instrumentation.ts 가 register 한 __massMailBatchTimer 가 있어야 ready=true.
 *
 * 정상이면 200, 한 항목이라도 실패면 503 — fail-closed 기조 (Phase 2 PR #62 대응).
 *
 * Edge runtime 에서는 setInterval 미동작이라 Node runtime 강제 (instrumentation 도 동일 분기).
 */
export const runtime = "nodejs";

interface BatchGlobals {
  __massMailBatchTimer?: NodeJS.Timeout | null;
}

export function GET() {
  const g = globalThis as unknown as BatchGlobals;
  const massMailBatch = Boolean(g.__massMailBatchTimer);

  // 배치 비활성 (MASS_MAIL_BATCH_INTERVAL_MS=0) 운영 환경에서도 readiness 자체는 통과시켜야 하나,
  // 이번 릴리스에선 자동 복구 미가동을 운영자가 즉시 인지하도록 503 으로 노출. 환경별 토글이 필요해지면
  // env 기반 expectBatch 플래그를 추가.
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
