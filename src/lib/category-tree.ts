/**
 * 카테고리 트리 구조 변환 헬퍼
 *
 * 콘텐츠에 연결된 카테고리들(자식)을 부모 카테고리 기준으로 그룹화하여
 * parent-children 트리 구조로 반환한다.
 *
 * 프론트엔드에서 테이블 헤더에 부모 카테고리를 묶어 표시하기 위해 사용.
 */

/** 카테고리 기본 필드 */
export interface CategoryNode {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
}

/** 자식 카테고리를 포함한 트리 노드 */
export interface CategoryTreeNode extends CategoryNode {
  children: CategoryNode[];
}

/** Prisma에서 include한 카테고리 레코드 타입 (parent 관계 포함) */
export interface CategoryWithParent {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
  parent: CategoryNode | null;
}

/**
 * 콘텐츠의 categories 연관 데이터를 parent-children 트리로 변환한다.
 *
 * 규칙:
 * - category.parent가 있으면 해당 parent로 그룹화하고 children 배열에 추가
 * - category.parent가 없으면(최상위 카테고리) 자체가 트리 루트가 되고 children은 빈 배열
 * - 동일 parent에 여러 자식이 있으면 children 배열에 누적
 * - 결과 정렬: parent.sortOrder → parent.id
 * - children 정렬: child.sortOrder → child.id
 */
export function buildCategoryTree(
  categoryLinks: Array<{ category: CategoryWithParent }>,
): CategoryTreeNode[] {
  const rootMap = new Map<number, CategoryTreeNode>();

  for (const { category } of categoryLinks) {
    const parent = category.parent;

    if (parent === null) {
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
          children: [],
        });
      }
      continue;
    }

    // 자식 카테고리 — parent로 그룹화
    if (!rootMap.has(parent.id)) {
      rootMap.set(parent.id, {
        id: parent.id,
        parentId: parent.parentId,
        categoryCode: parent.categoryCode,
        name: parent.name,
        isInternalOnly: parent.isInternalOnly,
        sortOrder: parent.sortOrder,
        isActive: parent.isActive,
        children: [],
      });
    }

    const root = rootMap.get(parent.id);
    if (!root) continue;

    // 중복 방지
    if (!root.children.some((c) => c.id === category.id)) {
      root.children.push({
        id: category.id,
        parentId: category.parentId,
        categoryCode: category.categoryCode,
        name: category.name,
        isInternalOnly: category.isInternalOnly,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      });
    }
  }

  // 정렬 — parent, children 모두 sortOrder → id 순
  const result = Array.from(rootMap.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id - b.id;
  });

  for (const root of result) {
    root.children.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id - b.id;
    });
  }

  return result;
}

/** Prisma include 옵션 (카테고리 + parent 관계) */
export const CATEGORY_TREE_INCLUDE = {
  select: {
    id: true,
    parentId: true,
    categoryCode: true,
    name: true,
    isInternalOnly: true,
    sortOrder: true,
    isActive: true,
    parent: {
      select: {
        id: true,
        parentId: true,
        categoryCode: true,
        name: true,
        isInternalOnly: true,
        sortOrder: true,
        isActive: true,
      },
    },
  },
} as const;
