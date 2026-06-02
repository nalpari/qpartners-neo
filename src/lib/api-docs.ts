/**
 * API 문서 노출 여부 가드.
 *
 * 대상: `/api-docs`(Scalar UI) + `/api/openapi`(OpenAPI 스펙 JSON 원본).
 * UI 는 내부적으로 `/api/openapi` 를 fetch 하므로 두 경로를 동일 기준으로 함께 차단해야 한다
 * (스펙 JSON 만 열려 있으면 직접 호출로 전체 스펙이 유출됨).
 *
 * allowlist 방식(fail-closed): APP_ENV 가 명시적으로 "development" 인 경우(=로컬·개발서버)에만 노출하고,
 * production / 누락 / 오타 등 그 외 모든 값은 차단한다. 운영서버 정보 노출 방지 목적.
 *
 * NODE_ENV 는 standalone 런타임에서 항상 "production" 이므로 배포 환경 판별에 사용하지 않는다
 * (프로젝트 전역 컨벤션 — config.ts / mailer.ts 와 동일하게 APP_ENV 기준).
 */
export function isApiDocsEnabled(): boolean {
  return process.env.APP_ENV === "development";
}
