import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isInternalUser } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { resolveBadgeFlags } from "@/lib/content-new-badge";
import { publishedTargetFilter } from "@/lib/content-visibility";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_MODEL_PUBLIC_SELECT,
  productModelVisibilityFilter,
} from "@/lib/product-model";
import { idParamSchema, productDetailQuerySchema } from "@/lib/schemas/product-model";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/products/:id — 제품상세 (REQ-010).
 *
 * 그 형번에 紐づく 자료 목록을 돌려준다. 검색화면의 분류축·키워드는 **적용하지 않는다** —
 * 목업 `renderProductPage()` 가 `DOCS.filter(d => d.productIds.includes(p.id))` 로
 * 형번 하나만 기준으로 모으는 것과 같다.
 *
 * 노출 불가 형번(비표시 / 제품일람 OFF / 사용중지·사내전용 카테고리)은 **404** 로 답한다.
 * 403 으로 구분하면 "그 형번은 존재한다" 는 사실이 새어 나간다.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);
    const internal = user ? isInternalUser(user.role) : false;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const query = productDetailQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!query.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: query.error.issues },
        { status: 400 },
      );
    }
    const { page, pageSize } = query.data;

    const product = await prisma.productModel.findFirst({
      where: { id: parsed.data, ...productModelVisibilityFilter(internal) },
      select: PRODUCT_MODEL_PUBLIC_SELECT,
    });

    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date();
    const andConditions: Prisma.ContentWhereInput[] = [
      { productModels: { some: { productModelId: product.id } } },
    ];
    // 사내 사용자는 게시대상·게시기간 미적용 (`/api/contents` GET 사내 분기와 동일 정책)
    if (!internal) {
      andConditions.push(publishedTargetFilter(user ? user.role : null, now));
    }

    const where: Prisma.ContentWhereInput = { status: "published", AND: andConditions };

    const includeOptions = {
      categories: { include: { category: CATEGORY_TREE_INCLUDE } },
      targets: { select: { roleCode: true, startAt: true, endAt: true } },
      _count: { select: { attachments: true } },
    } as const;

    const [contents, total] = await Promise.all([
      prisma.content.findMany({
        where,
        include: includeOptions,
        // 목업은 데모 배열 순서를 그대로 쓴다(정렬 미정). 공개일 내림차순이 자료 목록의
        // 기본값이라 그대로 따르고, 동일 공개일은 id 로 확정한다.
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.content.count({ where }),
    ]);

    const nowMs = now.getTime();
    const viewer = { internal, roleCode: user ? user.role : null };

    return NextResponse.json({
      data: {
        product,
        contents: contents.map((c) => ({
          id: c.id,
          title: c.title,
          publishedAt: c.publishedAt,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          viewCount: c.viewCount,
          hasBeenUpdated: c.updatedAt.getTime() !== c.createdAt.getTime(),
          ...resolveBadgeFlags(c, c.targets, viewer, nowMs),
          categories: buildCategoryTree(c.categories, { includeInternal: internal }),
          // 公開日 를 **목록과 같은 기준**으로 표시하기 위해 함께 내려보낸다 — 보는 사람의
          // 계층(roleCode)에 적용되는 startAt 이 공개일이고, 그 판정에 targets 가 필요하다.
          // 같은 자료의 公開日 이 목록과 제품상세에서 달라지면 안 된다.
          // (`/api/contents` GET 도 동일하게 targets 를 응답에 포함한다)
          targets: c.targets,
          attachmentCount: c._count.attachments,
        })),
      },
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    logError("GET /api/products/:id", error);
    return NextResponse.json({ error: "製品情報の取得に失敗しました" }, { status: 500 });
  }
}
