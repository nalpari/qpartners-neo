// 분류축(facet) 공용 — 축 선정 규칙과 제품일람 축 타입.
//
// 사이드바(`contents-facets.tsx`)와 컨테이너(`contents-contents.tsx`)가 **같은 축 집합**을
// 써야 한다. 사이드바가 렌더한 축을 컨테이너가 `facetAxes` 로 서버에 신고하는 구조라,
// 두 쪽이 갈라지면 "화면에 없는 축이 조건에 걸려 0건" 같은 증상이 난다.

import type { CategoryNode } from "./contents-contents";
import { LEGACY_PRODUCT_STATUS_AXIS_CODE } from "@/lib/schemas/common";

/**
 * 분류축으로 쓸 1Depth 카테고리.
 *
 * 기준은 **테이블의 분류 컬럼과 동일**하다 — `isVisible`(카테고리관리의 `一覧表示`)이 켜진
 * 1Depth 만. 사내전용 1Depth 는 비사내 사용자에게 내보내지 않는다: 축 제목이 부모
 * 카테고리명이라, 선택지가 비어도 사내 분류명이 그대로 드러난다.
 *
 * 축의 구성·순서·표시 여부는 전부 카테고리관리에서 정해진다 — 코드에 축 코드를 박지 않는다.
 * (종전 `PRIORITY_CATEGORY_ORDER` 가 폐지된 `業務分類`·`内容分類` 코드를 들고 있던 것이
 *  그 방식의 실패 사례다.)
 */
export function resolveVisibleAxes(
  categories: CategoryNode[],
  isInternal: boolean,
): CategoryNode[] {
  return categories.filter(
    (parent) =>
      // 제품상태는 형번의 속성으로 옮겨졌다 — 카테고리 축은 화면 어디에도 내지 않는다.
      // 카테고리 관리 설정과 무관하게 코드가 제외한다 (운영자가 켤 대상이 아니다).
      parent.categoryCode !== LEGACY_PRODUCT_STATUS_AXIS_CODE &&
      parent.isVisible !== false &&
      (isInternal || !parent.isInternalOnly),
  );
}

/** `GET /api/products/axis` 응답의 그룹 1건 — 제품일람 대상 2Depth 카테고리 + 그 안의 노출 형번 */
export interface ProductAxisGroup {
  id: number;
  categoryCode: string;
  name: string;
  sortOrder: number;
  /** false 면 선택 불가(무효 표시) — 사용중지 카테고리의 형번은 검색 조건에서 제외된다 */
  isActive: boolean;
  parent: {
    id: number;
    categoryCode: string;
    name: string;
    sortOrder: number;
    /** 1Depth 부모가 사용중지면 그 아래 형번은 조회 조건에서 빠진다 */
    isActive: boolean;
  } | null;
  /** 보는 사람에게 공개된 자료가 1건이라도 있는지 — false 면 선택해도 결과가 바뀌지 않는다 */
  productModels: { id: number; modelCode: string; sortOrder: number; hasDocuments: boolean }[];
}

/**
 * 축 그룹을 조회 조건으로 쓸 수 있는가 — **2Depth 와 1Depth 부모가 모두 사용중**이어야 한다.
 *
 * `productModelVisibilityFilter`(`lib/product-model.ts`)가 조회에서 요구하는 조건과 같다.
 * 2Depth 만 보면, 부모가 사용중지인 그룹이 화면에서 선택 가능해 보이는데 체크하면 0건이 된다.
 */
export function isProductAxisGroupActive(group: ProductAxisGroup): boolean {
  return group.isActive && group.parent?.isActive !== false;
}

/** `GET /api/products` 응답의 행 1건 — 제품일람 탭 3컬럼 */
export interface ProductListRow {
  id: number;
  modelCode: string;
  /** 제품상태 — 형번의 속성(REQ-007). 제품일람 4컬럼 중 하나다 */
  status: "current" | "eol";
  sortOrder: number;
  isVisible: boolean;
  updatedAt: string;
  category: {
    id: number;
    categoryCode: string;
    name: string;
    /** 사내전용 카테고리 — 전 화면 적색 표기용 */
    isInternalOnly: boolean;
    parent: {
      id: number;
      categoryCode: string;
      name: string;
      isInternalOnly: boolean;
    } | null;
  };
  /** 현재 검색·필터 조건에 걸린 자료 수 (資料数) */
  documentCount: number;
}
