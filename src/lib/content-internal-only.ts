/**
 * 사내전용 자료 판정 — 서버·화면 단일 출처.
 *
 * 「사내전용」 은 카테고리의 `isInternalOnly` 와 **다른 축**이다. 이쪽은 게시대상(`qp_content_targets`)
 * 기준으로, 외부 게시대상이 하나도 없는 콘텐츠를 사내전용으로 본다.
 *
 * `GET /api/contents` 의 `internalOnly` 필터와 같은 기준을 써야 한다 —
 * 좌측 「社内会員の投稿のみ表示」 로 걸러낸 집합과 목록에서 색이 칠해지는 행이 어긋나면
 * 체크했는데 색 없는 행이 나오거나 그 반대가 된다.
 *
 * 이 모듈은 **순수 함수만** 둔다 (prisma·next/server 미참조) — 클라이언트 컴포넌트에서도 import 한다.
 */

/**
 * 사내 권한 코드 — `isInternalUser`(auth.ts) 와 동일한 판정 기준.
 *
 * 사내 사용자는 `canAccessContent` fail-open 으로 모든 콘텐츠에 접근하므로 `ContentTarget` 에
 * 사내 행이 등록될 일은 거의 없지만, 명시적 화이트리스트로 "외부 게시대상이 0건" = 사내전용
 * 이라는 의미를 강제한다.
 *
 * 주의: 신규 사내 권한(예: IT_ADMIN)을 추가할 경우 `isInternalUser` 와 함께 이 배열도 갱신해야 한다.
 */
export const INTERNAL_ROLE_CODES: readonly string[] = ["SUPER_ADMIN", "ADMIN"];

/**
 * 게시대상 목록으로 사내전용 여부를 판정한다.
 *
 * Prisma 쪽 `targets: { none: { OR: [{ roleCode: null }, { roleCode: { notIn: INTERNAL_ROLE_CODES } }] } }`
 * 와 같은 식이다. 게시대상이 **0건인 콘텐츠도 사내전용**으로 본다 (`none` 과 동일) — 외부에
 * 공개된 적이 없으므로.
 */
export function isInternalOnlyContent(targets: { roleCode: string | null }[]): boolean {
  return !targets.some(
    (target) => target.roleCode === null || !INTERNAL_ROLE_CODES.includes(target.roleCode),
  );
}
