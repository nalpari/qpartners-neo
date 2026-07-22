/**
 * 게시대상(ContentTarget) roleCode 표시 순서 — 6 기본 권한 우선, 비회원(null) 마지막.
 * `src/hooks/use-target-labels.ts`(클라이언트) 와 `/api/contents`(서버 掲示対象 컬럼 정렬)
 * 양쪽에서 동일 기준을 써야 화면 표시 순서와 정렬 결과가 일치하므로 단일 정의로 공유한다.
 */
const TARGET_SYSTEM_ROLE_ORDER: Record<string, number> = {
  SUPER_ADMIN: 1,
  ADMIN: 2,
  "1ST_STORE": 3,
  "2ND_STORE": 4,
  SEKO: 5,
  GENERAL: 6,
};

/** roleCode (null = 비회원) → 표시 순위. 숫자가 작을수록 먼저 표시. */
export function targetOrderRank(roleCode: string | null): number {
  if (roleCode === null) return 999; // 비회원은 마지막
  return TARGET_SYSTEM_ROLE_ORDER[roleCode] ?? 100; // 커스텀 추가 권한은 기본 권한 뒤
}
