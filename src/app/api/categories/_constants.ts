/**
 * 카테고리 API 공용 상수.
 * cascade 삭제/미리보기에서 자손 수집의 안전 한도(SSoT) — 단일 출처에서만 변경.
 */

/** BFS 자손 수집 상한. 비정상 트리(자기 참조 사이클·잘못된 마이그레이션) 무한 루프 방지. */
export const CATEGORY_MAX_DESCENDANTS = 10_000;

/** cascade 자손 수가 상한 초과일 때 트랜잭션 내부에서 던지는 마커 에러.
 *  문자열 매칭 대신 `instanceof` 분기를 위해 클래스로 정의 (.claude/rules/api.md 원칙). */
export class MaxDescendantsExceededError extends Error {
  constructor(message = "MAX_DESCENDANTS exceeded") {
    super(message);
    this.name = "MaxDescendantsExceededError";
  }
}

/**
 * 카테고리 라우트 공용 도메인 에러.
 *
 * `Error("NOT_FOUND")` 등 문자열 매칭 패턴은 메시지 변경/번역에 silent fail 가능 → instanceof 분기로 통일.
 * - `NOT_FOUND`: PUT/DELETE 시 대상 카테고리 미존재
 * - `PARENT_NOT_FOUND`: POST 시 지정한 부모 카테고리 미존재
 * - `DEPTH_EXCEEDED`: POST 시 3Depth 이상 시도
 */
export class CategoryError extends Error {
  constructor(public readonly kind: "NOT_FOUND" | "PARENT_NOT_FOUND" | "DEPTH_EXCEEDED") {
    super(kind);
    this.name = "CategoryError";
  }
}
