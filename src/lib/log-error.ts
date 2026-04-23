/**
 * 공용 에러 로깅 인터페이스 — Phase 2 리뷰 이월분 (I-5).
 *
 * v1 (현재): `console.error` wrapper. context prefix 통일 + 선택적 extra 메타데이터 지원.
 * v2 (후속 PR): Sentry SDK 도입 시 내부만 `Sentry.captureException` 추가.
 *
 * 호출부는 v2 전환 시에도 변경 없음 — 이 파일만 교체하면 전체 라우트에 관측성 적용.
 */
export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  if (extra) {
    console.error(`[${context}]`, error, extra);
    return;
  }
  console.error(`[${context}]`, error);
}
