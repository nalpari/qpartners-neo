/**
 * 사내전용 카테고리 라벨 — **전 화면 공통 적색 표기**.
 *
 * 카테고리명이 노출되는 모든 화면(콘텐츠 목록·자료 상세·좌측 분류 필터·콘텐츠 등록·형번관리·
 * 카테고리관리·제품일람·제품상세·자동완성)에서 사내전용 카테고리는 같은 색으로 보여야 한다.
 * 화면마다 ternary 를 따로 쓰면 한 곳만 빠져도 사용자에게는 "어떤 화면에서는 안 빨갛다" 로 보인다.
 *
 * **적색 대상은 2Depth(분류 값)뿐이다** — 1Depth(축·그룹 라벨)는 사내전용이어도 기본색으로
 * 둔다(2026-10-23 사용자 결정). 축 제목까지 붉으면 한 축이 통째로 경고처럼 보여, 정작
 * 구분해야 할 개별 분류가 묻힌다.
 *
 * 색상은 `#FF1A1A` — 좌측 분류 필터(`contents-facets.tsx`)·자료 상세가 쓰던 값을 그대로 가져왔다.
 *
 * 적색은 **체크·hover 등 상태와 무관하게 유지**한다. 선택 중일 때 링크색(파란색)으로 덮이면
 * 사내전용 여부를 읽을 수 없게 되기 때문이다 — 상태색을 주는 쪽에서 이 클래스가 이기도록
 * 선택자를 맞춰야 한다(`contents-facets.tsx` 가 그 예).
 */

import type { ReactNode } from "react";

export const INTERNAL_CATEGORY_TEXT_CLASS = "text-[#FF1A1A]";

/** 색 판정에 필요한 최소 형태 — 카테고리 트리·형번 응답·자동완성 응답이 모두 이 모양을 만족한다 */
export interface CategoryLabelSource {
  name: string;
  isInternalOnly: boolean;
}

function join(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** 카테고리명 1건 */
export function CategoryName({
  category,
  className,
}: {
  category: CategoryLabelSource;
  className?: string;
}) {
  return (
    <span className={join(className, category.isInternalOnly && INTERNAL_CATEGORY_TEXT_CLASS)}>
      {category.name}
    </span>
  );
}

/**
 * `1Depth > 2Depth` 경로 — 형번이 붙는 2Depth 를 보여줄 때 쓴다.
 *
 * **자식(2Depth)만** 사내전용 색을 받는다. 부모(1Depth)는 값과 무관하게 기본색이다
 * (2026-10-23 결정).
 */
export function CategoryPath({
  category,
  className,
}: {
  category: CategoryLabelSource & { parent: CategoryLabelSource | null };
  className?: string;
}) {
  if (!category.parent) return <CategoryName category={category} className={className} />;
  return (
    <span className={className}>
      {category.parent.name}
      {" > "}
      <CategoryName category={category} />
    </span>
  );
}

/**
 * 제품 카테고리 1Depth 축의 `categoryCode` — 목업 `assets/qp-shell.js:111` 의
 * `PRODUCT_PARENT = "PROD"` 와 같은 값이다.
 */
export const PRODUCT_CATEGORY_PARENT_CODE = "PROD";

/**
 * 형번 카테고리 표기에 쓰는 최소 형태 — 부모 축을 **코드로** 판별해야 한다.
 *
 * 부모에는 `isInternalOnly` 를 요구하지 않는다. 적색은 2Depth 전용이라(2026-10-23 결정)
 * 부모는 이름만 쓰기 때문이다.
 */
export type ProductCategorySource = CategoryLabelSource & {
  parent: { name: string; categoryCode: string } | null;
};

/**
 * **형번이 붙는 카테고리** 표기 — 제품일람·제품상세·형번관리 공통.
 *
 * 목업 `assets/qp-shell.js:230` `categoryLabel()` 의 규칙 그대로다:
 *   - 부모가 `製品分類`(PROD) → **2Depth 만** (`太陽電池モジュール`)
 *   - 그 외 축 하위       → `1Depth > 2Depth` (`業務分類 > 施工`)
 *
 * 제품일람 대상이 전 카테고리로 열려 있어(REQ-008) 서로 다른 축에 같은 이름의 2Depth 가
 * 생길 수 있다. 제품분류는 그 화면의 기본 축이라 축 이름이 군더더기지만, 다른 축에서 온
 * 분류는 축을 함께 보여야 구분된다. 개발 DB 기준 현재 제품일람 대상 9개는 전부 제품분류
 * 하위라 실제 표시는 모두 2Depth 다 (2026-11-04 실측).
 */
export function ProductCategoryLabel({
  category,
  className,
}: {
  category: ProductCategorySource;
  className?: string;
}) {
  const parent = category.parent;
  if (!parent || parent.categoryCode === PRODUCT_CATEGORY_PARENT_CODE) {
    return <CategoryName category={category} className={className} />;
  }
  return (
    <span className={className}>
      {parent.name}
      {" > "}
      <CategoryName category={category} />
    </span>
  );
}

/**
 * `ProductCategoryLabel` 의 문자열 버전 — 정렬 키·`title` 툴팁·`<option>` 라벨처럼
 * JSX 를 쓸 수 없는 자리에 쓴다. 두 함수의 규칙이 갈리면 화면과 정렬이 어긋난다.
 */
export function formatProductCategoryLabel(category: {
  name: string;
  parent: { name: string; categoryCode: string } | null;
}): string {
  return !category.parent || category.parent.categoryCode === PRODUCT_CATEGORY_PARENT_CODE
    ? category.name
    : `${category.parent.name} > ${category.name}`;
}

/**
 * 카테고리명 목록 — 콘텐츠 1건에 같은 축의 분류가 여러 개 붙은 경우.
 *
 * 구분자는 `, ` 이고 **사내전용만** 적색이 된다. 빈 배열이면 `-`.
 */
export function CategoryNameList({
  categories,
  className,
}: {
  categories: CategoryLabelSource[];
  className?: string;
}) {
  if (categories.length === 0) return <span className={className}>-</span>;
  return (
    <span className={className}>
      {categories.map((category, i): ReactNode => (
        <span key={`${category.name}-${i}`}>
          {i > 0 && ", "}
          <CategoryName category={category} />
        </span>
      ))}
    </span>
  );
}
