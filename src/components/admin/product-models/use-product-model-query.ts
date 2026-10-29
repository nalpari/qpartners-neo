import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import api from "@/lib/axios";

import {
  formatCategoryLabel,
  type ProductCategoryOption,
  type ProductModelListResponse,
  type ProductModelSearchFilters,
} from "./product-models-types";

/** `/api/categories` 트리 노드 — 형번관리가 쓰는 필드만 */
interface CategoryTreeNode {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isActive: boolean;
  isProductList: boolean;
  children: CategoryTreeNode[];
}

/**
 * 형번 목록.
 *
 * 정렬은 **등록일 내림차순**을 명시 전송한다. API 기본 정렬(카테고리 표시순서 → 형번
 * 표시순서 → 형번명)은 이용자 화면용 「표시순서」 규칙이고, 관리 목록은 최근 등록분을
 * 위로 올리는 쪽이 운영에 맞다 — 목업도 `modelsByRegistration()`(`qp-shell.js:177`)로
 * createdAt 내림차순이다.
 *
 * `modelCode` 3자 미만은 **서버가 조건에서 제외**한다(목업 `MIN_Q` 게이트와 동일).
 * 화면에서 다시 자르지 않고 그대로 보내 판정 지점을 하나로 둔다.
 */
export function useProductModelList(
  filters: ProductModelSearchFilters,
  page: number,
  pageSize: number,
) {
  return useQuery<ProductModelListResponse>({
    queryKey: [
      "product-models",
      filters.modelCode,
      filters.categoryId,
      filters.visibility,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
        sortField: "createdAt",
        sortDir: "desc",
      };
      if (filters.modelCode.trim()) params.modelCode = filters.modelCode.trim();
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.visibility) params.isVisible = filters.visibility === "1" ? "true" : "false";

      const res = await api.get<ProductModelListResponse>("/product-models", { params });
      return res.data;
    },
  });
}

/**
 * 형번을 붙일 수 있는 카테고리 선택지.
 *
 * 조건은 목업 `fillCategorySelects()`(`03-admin-models.html:334`) 와 같다 —
 * **제품일람 표시 ON** 2Depth 중 **사용(isActive) 중**인 것만. 사용중지 카테고리를
 * 등록 대상으로 열어 두면 제품일람·형번축 어디에도 나타나지 않는 형번이 생긴다.
 * 1Depth 부모의 사용 여부도 함께 본다 — 부모가 꺼지면 자식도 제품일람에서 빠진다.
 *
 * `activeOnly=false` 로 **전체 트리**를 받는 이유: 비활성 카테고리에 이미 붙어 있는
 * 형번을 편집할 때 현재 카테고리명을 표시해야 한다(`inactiveLabels` 가 그 용도).
 * 선택지에는 넣지 않고 라벨 조회만 한다.
 *
 * queryKey 가 `["categories", "all"]` 로 카테고리관리 화면과 같다 — 같은 조회를
 * 공유하고, 카테고리 수정 시 `invalidateQueries(["categories"])` 로 함께 갱신된다.
 */
export function useProductCategoryOptions() {
  const query = useQuery<CategoryTreeNode[]>({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryTreeNode[] }>("/categories", {
        params: { activeOnly: "false" },
      });
      return res.data.data;
    },
    staleTime: Infinity,
  });

  const tree = query.data;

  const { options, inactiveLabels } = useMemo(() => {
    const opts: ProductCategoryOption[] = [];
    const labels = new Map<number, string>();
    if (!tree) return { options: opts, inactiveLabels: labels };

    for (const parent of tree) {
      for (const child of parent.children) {
        if (!child.isProductList) continue;
        const label = formatCategoryLabel({ name: child.name, parent: { name: parent.name } });
        if (child.isActive && parent.isActive) {
          opts.push({ value: String(child.id), label });
        } else {
          labels.set(child.id, label);
        }
      }
    }
    return { options: opts, inactiveLabels: labels };
  }, [tree]);

  return { options, inactiveLabels, isLoading: query.isLoading, isError: query.isError };
}
