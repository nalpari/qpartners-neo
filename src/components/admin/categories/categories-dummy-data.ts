// Design Ref: §3 — CategoryItem 타입 정의 + 더미 데이터

export interface CategoryItem {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
}

export type CategoryTree = CategoryItem & {
  children: CategoryItem[];
};

export const DUMMY_CATEGORIES: CategoryItem[] = [
  // 1Depth: 商品分類
  { id: 1, parentId: null, categoryCode: "PRODUCT_TYPE", name: "商品分類", isInternalOnly: false, sortOrder: 1, isActive: true },
  { id: 11, parentId: 1, categoryCode: "CTE001", name: "ソーラーモジュール", isInternalOnly: false, sortOrder: 1, isActive: true },
  { id: 12, parentId: 1, categoryCode: "CTE002", name: "パワーコンディショナー", isInternalOnly: false, sortOrder: 2, isActive: true },
  { id: 13, parentId: 1, categoryCode: "CTE003", name: "架台", isInternalOnly: false, sortOrder: 3, isActive: true },
  { id: 14, parentId: 1, categoryCode: "CTE004", name: "蓄電池", isInternalOnly: false, sortOrder: 4, isActive: true },
  { id: 15, parentId: 1, categoryCode: "CTE005", name: "その他", isInternalOnly: false, sortOrder: 5, isActive: true },

  // 1Depth: その他の分類
  { id: 2, parentId: null, categoryCode: "OTHER_TYPE", name: "その他の分類", isInternalOnly: false, sortOrder: 2, isActive: true },
  { id: 21, parentId: 2, categoryCode: "CTE006", name: "保証・補償", isInternalOnly: false, sortOrder: 1, isActive: true },
  { id: 22, parentId: 2, categoryCode: "CTE007", name: "技術・方向性", isInternalOnly: false, sortOrder: 2, isActive: true },
  { id: 23, parentId: 2, categoryCode: "CTE008", name: "物流", isInternalOnly: false, sortOrder: 3, isActive: true },
];

export function generateNextId(categories: CategoryItem[]): number {
  return Math.max(...categories.map((c) => c.id), 0) + 1;
}

export function buildTree(categories: CategoryItem[]): CategoryTree[] {
  const parents = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return parents.map((parent) => ({
    ...parent,
    children: categories
      .filter((c) => c.parentId === parent.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}
