import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isInternalUser } from "@/lib/auth";
import {
  buildKeywordCondition,
  checkSearchRateLimit,
  tokenizeKeyword,
} from "@/lib/content-search";
import {
  publishedTargetFilter,
  resolveFacetConditions,
} from "@/lib/content-visibility";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  modelCodeCollator,
  PRODUCT_MODEL_PUBLIC_SELECT,
  productModelVisibilityFilter,
} from "@/lib/product-model";
import { listProductsQuerySchema } from "@/lib/schemas/product-model";

/**
 * GET /api/products — 제품일람 탭 (REQ-003 / REQ-005).
 *
 * **자료일람과 같은 검색 결과를 형번 단위로 다시 묶는다.** 목업 `render()` 의
 * `state.view === "prod"` 분기와 동일하게, 조건에 걸린 자료를 紐づく 형번마다 세어
 * `資料数` 를 만든다. 따라서:
 *   - 조건에 맞는 자료가 0건인 형번은 **목록에 나오지 않는다** (축에는 남는다 — `/api/products/axis`)
 *   - 한 자료가 형번 N 개를 가지면 N 행에 각각 집계된다 (자료 : 제품 = 1 : N)
 *
 * 비로그인 포함 공개 조회(middleware `PUBLIC_GET_PATTERNS`)이며, 자료의 노출 범위는
 * `/api/contents` GET 과 같은 게시대상·게시기간 규칙을 쓴다(`publishedTargetFilter`).
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    const internal = user ? isInternalUser(user.role) : false;

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = listProductsQuerySchema.safeParse(params);
    if (!query.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: query.error.issues },
        { status: 400 },
      );
    }

    const {
      page,
      pageSize,
      keyword,
      keywordOp,
      facetCategoryIds,
      productModelIds,
      sortField,
      sortDir,
    } = query.data;

    const emptyResponse = NextResponse.json({
      data: [],
      meta: { total: 0, page, pageSize, totalPages: 0 },
    });

    // 비사내 호출 **전체**에 적용한다 (2026-10-29 사용자 결정). 이 경로는 키워드가 없어도
    // 공개 자료를 모아 형번별로 묶고 정렬하므로 단순 페이징이 아니다.
    //
    // 키워드 유무로 **버킷을 나눈다** — 검색 폭주가 일반 열람(탭 전환·페이징·정렬)을 같이
    // 막지 않게. 한도는 IP 당 60회/분이고, 공유 IP 뒤에서는 사용자들의 호출이 합산된다.
    if (!internal) {
      const limited = checkSearchRateLimit(
        request,
        keyword ? "products-search" : "products-list",
        user?.userId ?? null,
      );
      if (limited) return limited;
    }

    // publication window 경계값 일관성 — 동일 where 절 안의 now 를 상수화
    const now = new Date();
    const andConditions: Prisma.ContentWhereInput[] = [];

    // 사내 사용자는 게시대상·게시기간을 적용하지 않는다 (예정/만료분까지 관리 목적으로 점검).
    // `/api/contents` GET 의 사내 분기와 같은 정책.
    if (!internal) {
      andConditions.push(publishedTargetFilter(user ? user.role : null, now));
    }

    // 체크된 축만 조건이 된다 — 체크가 없으면 빈 조건이다 (거르지 않는다).
    const facetConditions = await resolveFacetConditions(facetCategoryIds ?? []);
    andConditions.push(...facetConditions.conditions);

    const keywordTokens = tokenizeKeyword(keyword);
    const keywordCondition = buildKeywordCondition(keywordTokens, keywordOp);
    if (keywordCondition) andConditions.push(keywordCondition);

    // 型番 축 — 체크된 형번에 紐づく 자료만 대상으로 한다.
    // 아래 링크 조회에서도 같은 필터를 걸어야 한다. 여기만 걸면 "체크한 형번 때문에 살아남은
    // 자료"의 **다른** 형번까지 행으로 나온다 (목업 주석과 동일한 함정).
    if (productModelIds && productModelIds.length > 0) {
      andConditions.push({
        productModels: { some: { productModelId: { in: productModelIds } } },
      });
    }

    const where: Prisma.ContentWhereInput = {
      status: "published",
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    // 1단계: 조건에 걸린 자료의 id·제목. 제목은 관련도 정렬용으로만 쓴다(추가 쿼리 없음).
    // 전체 id 를 메모리에 올리는 구조는 `/api/contents` GET 의 sortTargets 분기와 같다 —
    // 제품 단위 집계는 ORM orderBy 로 표현할 수 없어 애플리케이션에서 묶는다.
    const docs = await prisma.content.findMany({ where, select: { id: true, title: true } });
    if (docs.length === 0) return emptyResponse;

    // 2단계: 자료-형번 링크. 노출 가능한 형번만 남긴다 (비표시·제품일람 OFF·사용중지 카테고리 제외).
    const links = await prisma.contentProductModel.findMany({
      where: {
        contentId: { in: docs.map((d) => d.id) },
        ...(productModelIds && productModelIds.length > 0
          ? { productModelId: { in: productModelIds } }
          : {}),
        productModel: productModelVisibilityFilter(internal),
      },
      select: { contentId: true, productModelId: true },
    });
    if (links.length === 0) return emptyResponse;

    // 3단계: 형번별 자료 수 집계.
    //
    // 종전에는 "제목에 맞은 자료가 있는가"(관련도 점수)도 함께 집계했으나, 제품일람 정렬이
    // **카테고리 표시순서 → 형번 오름차순**으로 확정되어(REQ-005) 관련도가 정렬에 쓰이지
    // 않는다. 키워드는 `where` 로 이미 걸러졌으므로 점수 계산은 비용만 남는다.
    const agg = new Map<number, number>();
    for (const link of links) {
      agg.set(link.productModelId, (agg.get(link.productModelId) ?? 0) + 1);
    }

    const models = await prisma.productModel.findMany({
      where: { id: { in: [...agg.keys()] } },
      select: PRODUCT_MODEL_PUBLIC_SELECT,
    });

    const rows = models.map((m) => ({
      ...m,
      documentCount: agg.get(m.id) ?? 0,
    }));

    // 4단계: 정렬.
    //   - 헤더 클릭(`sortField`) 이 있으면 그 기준이 최우선
    //   - 없으면 **카테고리 표시순서 → 형번 표시순서 → 형번명 昇順**
    //
    // 요구사항정의서 v1.1 REQ-005: 「[제품일람] : 카테고리 표시순서 → 형번 오름차순으로 정렬한다」.
    // 목업 업무리뷰 결정사항(2026-10-20)도 동일하다 — 「製品一覧の並び順はカテゴリの表示順序 →
    // 品番順（昇順）」. 목업 `updateSuggest` 의 제품 후보 정렬 키와 같은 순서다.
    //
    // ⚠️ **키워드가 있어도 관련도순으로 바꾸지 않는다.** 종전 구현은 관련도 → 갱신일 내림차순
    // 이었는데(「현업 미회신」으로 둔 잠정값), 회신이 위 결정사항으로 와 있었다. 관련도 점수는
    // 자료일람(`/api/contents`)에만 남는다.
    const dir = sortDir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      if (sortField === "modelCode") {
        return dir * modelCodeCollator.compare(a.modelCode, b.modelCode);
      }
      if (sortField === "documentCount") {
        return (
          dir * (a.documentCount - b.documentCount) ||
          modelCodeCollator.compare(a.modelCode, b.modelCode)
        );
      }
      // 카테고리 표시순서는 1Depth → 2Depth 순으로 본다. 표시순서 중복을 허용하므로
      // 동순위는 이름·형번명으로 확정한다 (목업 `catOrderOf → cat 名 → modelOrder → model 名`).
      return (
        (a.category.parent?.sortOrder ?? 0) - (b.category.parent?.sortOrder ?? 0) ||
        modelCodeCollator.compare(a.category.parent?.name ?? "", b.category.parent?.name ?? "") ||
        a.category.sortOrder - b.category.sortOrder ||
        modelCodeCollator.compare(a.category.name, b.category.name) ||
        a.sortOrder - b.sortOrder ||
        modelCodeCollator.compare(a.modelCode, b.modelCode)
      );
    });

    const total = rows.length;
    const pageRows = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    return NextResponse.json({
      data: pageRows,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    logError("GET /api/products", error);
    return NextResponse.json({ error: "製品一覧の取得に失敗しました" }, { status: 500 });
  }
}
