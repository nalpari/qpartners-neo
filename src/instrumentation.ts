/**
 * Next.js 기동 훅 (instrumentation.ts).
 *
 * Next.js 가 서버 시작 시 1회 자동 호출 — 백그라운드 작업 등록 용도.
 *
 * 등록 항목
 *   - 대량메일 자동 재시도 배치 (3분 cron) — Plan v0.4 / Design v0.3 §4.6
 *
 * 주의
 *   - Edge runtime 에서는 setInterval 동작 불가 → Node.js runtime 만 등록
 *   - Build 시점이 아닌 server 기동 시점에만 실행 (NEXT_RUNTIME 분기로 보장)
 *   - 동적 import 로 cold-start 영향 최소화
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startAutoRetryBatch } = await import("@/lib/mass-mail/auto-retry-batch");
  startAutoRetryBatch();
}
