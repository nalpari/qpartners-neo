/**
 * 카테고리 트리 구조 변환 헬퍼
 *
 * 콘텐츠에 연결된 카테고리들(자식)을 부모 카테고리 기준으로 그룹화하여
 * parent-children 트리 구조로 반환한다.
 *
 * 프론트엔드에서 테이블 헤더에 부모 카테고리를 묶어 표시하기 위해 사용.
 */

import type { Prisma } from "@/generated/prisma/client";

/**
 * Prisma include 옵션 (카테고리 + parent 관계).
 * `CategoryWithParent` 타입이 이 select 구조로부터 자동 추론된다.
 */
export const CATEGORY_TREE_INCLUDE = {
  select: {
    id: true,
    parentId: true,
    categoryCode: true,
    name: true,
    isInternalOnly: true,
    sortOrder: true,
    isActive: true,
    isVisible: true,
    parent: {
      select: {
        id: true,
        parentId: true,
        categoryCode: true,
        name: true,
        isInternalOnly: true,
        sortOrder: true,
        isActive: true,
        isVisible: true,
      },
    },
  },
} as const;

/** 카테고리 기본 필드 */
export interface CategoryNode {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
  /** 콘텐츠 목록 ag-grid 카테고리 컬럼 노출 여부 (1Depth 전용). 트리 응답에는 무관. */
  isVisible: boolean;
}

/** 자식 카테고리를 포함한 트리 노드 */
export interface CategoryTreeNode extends CategoryNode {
  children: CategoryNode[];
}

/**
 * Prisma에서 include한 카테고리 레코드 타입 (parent 관계 포함).
 * `CATEGORY_TREE_INCLUDE.select`로부터 자동 추론되어 스키마/select 변경 시 동기 유지.
 */
export type CategoryWithParent = Prisma.CategoryGetPayload<typeof CATEGORY_TREE_INCLUDE>;

/** buildCategoryTree 옵션 */
export interface BuildCategoryTreeOptions {
  /**
   * 사내 사용자(admin) 여부. true 면 isInternalOnly 카테고리도 응답에 포함.
   * false(기본) 면 parent/child 중 isInternalOnly=true 인 노드는 제외한다.
   * MF-1: 공개 자식이 내부공개 전용 부모 아래 매달린 경우 부모 메타데이터
   *        (name, categoryCode 등)가 외부 사용자에게 노출되지 않도록 방어.
   */
  includeInternal?: boolean;
}

/**
 * 콘텐츠의 categories 연관 데이터를 parent-children 트리로 변환한다.
 *
 * **전제**: 본 헬퍼는 "부모 - 자식" 2단 구조만 처리한다. 3단 이상 계층이
 * 넘어올 경우 조부모 노드는 자식으로 오분류된다 (현재 도메인은 2단 구조).
 *
 * **규칙**:
 * - `category.parentId === null` 이면 최상위 카테고리 → 자체가 루트, children = []
 * - `parentId !== null && parent !== null` 이면 해당 parent 로 그룹화하여 children 에 누적
 * - `parentId !== null && parent === null` 은 orphan (부모 삭제됨, onDelete:SetNull) → 제외
 * - `category.id === category.parentId` self-reference cycle → 제외
 * - MF-3: `isActive === false` 인 카테고리(및 부모)는 응답에서 제외 — soft-delete 숨김 정책
 * - MF-1: `opts.includeInternal !== true` 일 경우 `isInternalOnly === true` 인 부모/자식 노드 제외
 * - 정렬: parent.sortOrder → parent.id, children.sortOrder → children.id
 * - children dedup: Set<number> 로 O(n) 중복 제거
 */
export function buildCategoryTree(
  categoryLinks: Array<{ category: CategoryWithParent }>,
  opts: BuildCategoryTreeOptions = {},
): CategoryTreeNode[] {
  const includeInternal = opts.includeInternal === true;
  const rootMap = new Map<number, CategoryTreeNode>();
  /** root id → 이미 추가된 child id 집합 (dedup) */
  const childIdsByRoot = new Map<number, Set<number>>();

  /**
   * 노드를 응답에 노출할지 여부 — isActive, isInternalOnly 정책 평가.
   * 주의: 동명의 `isVisible` 필드(ag-grid 컬럼 노출 플래그)와 무관 — 이름 충돌을 피하기 위해
   * 함수명은 `shouldShow` 로 사용한다.
   */
  const shouldShow = (node: CategoryNode): boolean => {
    if (node.isActive === false) return false;
    if (!includeInternal && node.isInternalOnly === true) return false;
    return true;
  };

  for (const { category } of categoryLinks) {
    // self-reference cycle 방어
    if (category.parentId !== null && category.parentId === category.id) {
      continue;
    }

    // 자기 자신 가시성 확인 — 비활성/내부전용이면 즉시 스킵
    if (!shouldShow(category)) continue;

    if (category.parentId === null) {
      // 최상위 카테고리 — 자체가 루트
      if (!rootMap.has(category.id)) {
        rootMap.set(category.id, {
          id: category.id,
          parentId: category.parentId,
          categoryCode: category.categoryCode,
          name: category.name,
          isInternalOnly: category.isInternalOnly,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
          isVisible: category.isVisible,
          children: [],
        });
        childIdsByRoot.set(category.id, new Set());
      }
      continue;
    }

    // parentId 는 있으나 parent 가 null 이면 orphan — 부모가 삭제된 상태 (SetNull)
    const parent = category.parent;
    if (parent === null) continue;

    // 부모 가시성 확인 — 자식이 공개여도 부모가 내부전용/비활성이면 제외 (MF-1, MF-3)
    if (!shouldShow(parent)) continue;

    // 자식 카테고리 — parent 로 그룹화
    if (!rootMap.has(parent.id)) {
      rootMap.set(parent.id, {
        id: parent.id,
        parentId: parent.parentId,
        categoryCode: parent.categoryCode,
        name: parent.name,
        isInternalOnly: parent.isInternalOnly,
        sortOrder: parent.sortOrder,
        isActive: parent.isActive,
        isVisible: parent.isVisible,
        children: [],
      });
      childIdsByRoot.set(parent.id, new Set());
    }

    const root = rootMap.get(parent.id);
    const seenChildIds = childIdsByRoot.get(parent.id);
    if (!root || !seenChildIds) continue;

    // 중복 방지 — Set<number> 로 O(1)
    if (!seenChildIds.has(category.id)) {
      seenChildIds.add(category.id);
      root.children.push({
        id: category.id,
        parentId: category.parentId,
        categoryCode: category.categoryCode,
        name: category.name,
        isInternalOnly: category.isInternalOnly,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        isVisible: category.isVisible,
      });
    }
  }

  // 정렬 — parent, children 모두 sortOrder → id 순
  // sortOrder 는 Prisma 스키마상 non-nullable 이지만 방어적으로 coalesce
  const bySortOrderThenId = <T extends { sortOrder: number; id: number }>(a: T, b: T): number => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  };

  const result = Array.from(rootMap.values()).sort(bySortOrderThenId);
  for (const root of result) {
    root.children.sort(bySortOrderThenId);
  }

  return result;
}

