/**
 * 형번관리 라우트 공용 — 권한 가드 · 카테고리 적격성 검증.
 */

import { NextResponse } from "next/server";

import { resolveMenuPermission, getUserFromHeaders, type UserInfo } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 형번 마스터 **조회** 가드.
 *
 * 소비처가 두 군데라 메뉴 하나로 묶을 수 없다:
 *   1. 형번관리 화면(`/admin/product-models`) — `ADM_PRODUCT_MODEL.read`
 *   2. 콘텐츠 등록·수정 폼의 `紐づく型番` 선택 — `CONTENT.create` / `CONTENT.update`
 *
 * 기본 시드에서는 두 메뉴가 모두 관리자 전용이라 결과가 같지만, 권한 정본은 권한관리 화면이다
 * (운영자가 특정 역할에 콘텐츠 등록만 열어 줄 수 있다). 그때 형번 선택지가 403 으로 비어
 * 등록이 막히는 것을 피하려고 **둘 중 하나라도 있으면 통과**시킨다.
 *
 * 비표시(`isVisible=false`) 형번까지 응답에 포함되는 경로이므로 비로그인은 통과시키지 않는다 —
 * 이용자 화면용 조회는 `/api/products` · `/api/search/suggest` 가 담당한다.
 */
export async function requireProductModelRead(
  headers: Headers,
): Promise<{ user: UserInfo } | NextResponse> {
  const user = getUserFromHeaders(headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const [adminPerm, contentPerm] = await Promise.all([
    resolveMenuPermission(user, "ADM_PRODUCT_MODEL"),
    resolveMenuPermission(user, "CONTENT"),
  ]);

  if (adminPerm.canRead || contentPerm.canCreate || contentPerm.canUpdate) {
    return { user };
  }

  console.warn(
    `[requireProductModelRead] 권한 거부 — role=${user.role} (ADM_PRODUCT_MODEL.read / CONTENT.create / CONTENT.update 모두 없음)`,
  );
  return NextResponse.json({ error: "権限がありません" }, { status: 403 });
}

export type CategoryCheckFailure =
  | "NOT_FOUND"
  | "NOT_LEAF"
  | "NOT_PRODUCT_LIST";

const CATEGORY_CHECK_MESSAGE: Record<CategoryCheckFailure, string> = {
  NOT_FOUND: "カテゴリが存在しません",
  NOT_LEAF: "型番は 2Depth カテゴリにのみ登録できます",
  NOT_PRODUCT_LIST: "製品一覧表示が ON のカテゴリのみ選択できます",
};

/**
 * 형번을 붙일 카테고리의 적격성 검증.
 *
 * - **2Depth 한정**: 1Depth(축)에는 형번을 붙이지 않는다. `is_product_list` 자체는 전 카테고리에
 *   저장 가능하지만(고객 확장성 요구), 1Depth 의 값은 목업 `productListCategories()`
 *   (`!c.isParent && c.isProductList`) 에서도 무시되는 비활성 값이다.
 * - **제품일람 대상 한정**: `isProductList=false` 카테고리에 형번을 넣으면 제품일람·형번축
 *   어디에도 나타나지 않는 유령 데이터가 된다.
 *
 * `isActive=false` 카테고리는 **허용한다** — 사용 중지된 카테고리의 형번은 축에 남겨 두고
 * 검색 조건에서만 제외하는 것이 목업 정책(`INACTIVE_CATS`)이라, 등록 자체를 막으면
 * 일시 중지 중에 편집이 불가능해진다.
 *
 * @returns 적격이면 `null`, 아니면 400 응답
 */
export async function assertProductCategory(
  categoryId: number,
): Promise<NextResponse | null> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { parentId: true, isProductList: true },
  });

  const failure: CategoryCheckFailure | null = !category
    ? "NOT_FOUND"
    : category.parentId === null
      ? "NOT_LEAF"
      : !category.isProductList
        ? "NOT_PRODUCT_LIST"
        : null;

  if (failure === null) return null;

  return NextResponse.json(
    { error: CATEGORY_CHECK_MESSAGE[failure] },
    { status: failure === "NOT_FOUND" ? 404 : 400 },
  );
}

/** 형번 중복 — `(category_id, model_code)` UNIQUE 위반 시 공통 응답 */
export const DUPLICATE_MODEL_RESPONSE = {
  error: "同じカテゴリ内に同じ型番が登録されています。",
} as const;
