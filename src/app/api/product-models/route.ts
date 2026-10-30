import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import type { Prisma } from "@/generated/prisma/client";

import { requireMenuPermission } from "@/lib/auth";
import { escapeLikePattern } from "@/lib/content-search";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { PRODUCT_MODEL_CATEGORY_SELECT } from "@/lib/product-model";
import {
  createProductModelSchema,
  listProductModelsQuerySchema,
} from "@/lib/schemas/product-model";

import {
  assertProductCategory,
  DUPLICATE_MODEL_RESPONSE,
  requireProductModelRead,
} from "./_shared";

/**
 * GET /api/product-models — 형번 마스터 목록 (REQ-007, 목업 03 형번관리).
 *
 * 비표시 형번도 포함해 돌려준다. 이용자 화면용 조회는 `/api/products`(제품일람)와
 * `/api/search/suggest`(자동완성) 가 맡으며, 그쪽은 `isVisible=true` 만 본다.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProductModelRead(request.headers);
    if (auth instanceof NextResponse) return auth;

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = listProductModelsQuerySchema.safeParse(params);
    if (!query.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: query.error.issues },
        { status: 400 },
      );
    }

    const { page, pageSize, modelCode, categoryId, isVisible, status, sortField, sortDir } =
      query.data;

    const where: Prisma.ProductModelWhereInput = {
      // 입력한 `%`·`_` 를 와일드카드로 해석하지 않는다 — 본검색과 같은 기준.
      ...(modelCode && { modelCode: { contains: escapeLikePattern(modelCode) } }),
      ...(categoryId !== undefined && { categoryId }),
      ...(isVisible !== undefined && { isVisible }),
      // 제품상태(REQ-007 관리 항목) — 03 화면 검색조건
      ...(status !== undefined && { status }),
    };

    // 기본 정렬 = 카테고리 표시순서 → 형번 표시순서 → 형번명 昇順.
    // 표시순서는 중복을 허용하므로(2026-10-08 리뷰 결정) 동순위 tie-break 로 형번명이 반드시 필요하다.
    const dir = sortDir ?? "asc";
    const orderBy: Prisma.ProductModelOrderByWithRelationInput[] = sortField
      ? [{ [sortField]: dir } as Prisma.ProductModelOrderByWithRelationInput, { modelCode: "asc" }]
      : [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { modelCode: "asc" }];

    const [rows, total] = await Promise.all([
      prisma.productModel.findMany({
        where,
        include: { category: PRODUCT_MODEL_CATEGORY_SELECT },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productModel.count({ where }),
    ]);

    return NextResponse.json({
      data: rows,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    logError("GET /api/product-models", error);
    return NextResponse.json({ error: "型番の取得に失敗しました" }, { status: 500 });
  }
}

/** POST /api/product-models — 형번 등록 (ADM_PRODUCT_MODEL.create) */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PRODUCT_MODEL", "create");
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn("[POST /api/product-models] Request body 파싱 실패:", parseError);
      return NextResponse.json({ error: "リクエスト形式が正しくありません" }, { status: 400 });
    }

    const result = createProductModelSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const categoryError = await assertProductCategory(result.data.categoryId);
    if (categoryError) return categoryError;

    // 중복은 선조회로 막지 않는다 — `(category_id, model_code)` UNIQUE 가 콜레이션
    // (`utf8mb4_unicode_ci`: 대소문자·뒤 공백 무시) 기준으로 판정하므로, 애플리케이션에서
    // 다시 비교하면 판정 기준이 둘로 갈라지고 TOCTOU 창도 생긴다. P2002 를 409 로 번역한다.
    const created = await prisma.productModel.create({
      data: { ...result.data, createdBy: user.userId, updatedBy: user.userId },
      include: { category: PRODUCT_MODEL_CATEGORY_SELECT },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(DUPLICATE_MODEL_RESPONSE, { status: 409 });
    }
    logError("POST /api/product-models", error);
    return NextResponse.json({ error: "型番の登録に失敗しました" }, { status: 500 });
  }
}
