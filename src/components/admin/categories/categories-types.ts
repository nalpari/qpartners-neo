// Design Ref: §2 — API Response 타입 + §5 자동채번 로직

/** API GET /api/categories 응답의 각 노드 */
export interface CategoryNode {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
  children: CategoryNode[];
}

/** POST 요청 body */
export interface CreateCategoryPayload {
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
}

/** PUT 요청 body (모든 필드 optional) */
export interface UpdateCategoryPayload {
  name?: string;
  isInternalOnly?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/** CategoriesDetail 폼 상태 */
export interface CategoryFormState {
  isInternalOnly: boolean;
  parentId: number | null;
  categoryCode: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * 2Depth 카테고리 코드 자동 생성
 * 규칙: {parentCode}{3자리 순번}
 * 예: 부모 "CTE" → 자식 "CTE001", "CTE002", ...
 */
export function generateChildCode(parentCode: string, siblings: CategoryNode[]): string {
  const nums = siblings
    .map((c) => {
      const suffix = c.categoryCode.slice(parentCode.length);
      return Number(suffix);
    })
    .filter((n) => !isNaN(n) && n > 0);

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${parentCode}${String(next).padStart(3, "0")}`;
}

/** 트리에서 ID로 카테고리 검색 (1Depth + 2Depth) */
export function findCategoryById(tree: CategoryNode[], id: number): CategoryNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = node.children.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}
