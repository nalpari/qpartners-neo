/**
 * Next.js 기동 훅 (instrumentation.ts).
 *
 * Next.js 가 서버 시작 시 1회 자동 호출 — 백그라운드 작업 등록 용도.
 *
 * 등록 항목
 *   - 대량메일 자동 재시도 배치 (3분 cron) — Plan/Design §4.6 (mass-mail-send)
 *
 * 주의
 *   - Edge runtime 에서는 setInterval 동작 불가 → Node.js runtime 만 등록
 *   - Build 시점이 아닌 server 기동 시점에만 실행 (NEXT_RUNTIME 분기로 보장)
 *   - 동적 import 로 cold-start 영향 최소화
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { startAutoRetryBatch } = await import("@/lib/mass-mail/auto-retry-batch");
    startAutoRetryBatch();
  } catch (error: unknown) {
    // Fail-closed: 배치 미동작 상태로 서버를 띄우면 pending 메일이 영구 잔존하므로
    // CRITICAL 로그 후 throw → Next.js 기동 실패 → 운영자가 즉시 인지.
    // /api/health readiness probe 도 __massMailBatchTimer 존재 여부를 함께 검사 (이중 안전망).
    console.error(
      "[instrumentation] CRITICAL — auto-retry-batch 등록 실패. 대량메일 자동 재시도 미가동 (pending 메일이 발송되지 않음).",
      error,
    );
    throw error;
  }
}
