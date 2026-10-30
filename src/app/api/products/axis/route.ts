import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders, isInternalUser } from "@/lib/auth";
import { publishedTargetFilter } from "@/lib/content-visibility";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { modelCodeCollator } from "@/lib/product-model";

/**
 * GET /api/products/axis — 검색화면 좌측 `型番（製品一覧）` 축의 선택지 (REQ-003).
 *
 * 제품일람 **집계**(`/api/products`)와 목적이 다르다. 집계는 현재 검색조건에 걸린 형번만
 * 돌려주지만, 축은 **검색조건과 무관하게 고정**이어야 한다 — 체크를 풀 때마다 선택지가
 * 사라지면 되돌릴 수 없기 때문이다. 목업도 `MODELS_BY_CAT` 를 최초 1회만 만든다.
 *
 * 카테고리 관리 설정 반영 규칙은 목업(`01-search.html` `passesFacets` 주석)과 같다:
 *   - `製品一覧表示 = N` 카테고리 → 축에도 나오지 않는다
 *   - `使用 = N`(isActive=false) 카테고리 → **축에는 남기고** 무효 표시한다
 *     (`isActive: false` 로 내려보내므로 화면이 disabled 처리) — 검색 조건에서의 제외는
 *     `/api/products` 쪽 `productModelVisibilityFilter` 가 담당
 *   - 제품일람 대상 카테고리가 0건이면 제품일람 탭 자체를 끈다 → `enabled: false`
 *
 * 각 형번에는 `hasDocuments` 를 함께 내려보낸다 — **보는 사람에게 공개된 자료가 1건이라도
 * 있는지**다(2026-10-13 사용자 결정). 자료가 없는 형번은 체크해도 결과가 달라지지 않아
 * 화면이 무효 체크박스를 켜 둔 꼴이 된다. 판정에 노출범위를 반영하는 이유는, 전체 자료
 * 기준으로 세면 **비공개 자료가 붙어 있는 형번의 존재가 새어 나가기** 때문이다.
 *
 * `표시순서 기본 10건 + 전체보기 팝업`은 화면 표현이라 여기서 자르지 않는다 — 정렬된
 * 전량을 돌려주고 자르기는 화면이 한다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    const internal = user ? isInternalUser(user.role) : false;

    const categories = await prisma.category.findMany({
      where: {
        // 형번은 2Depth 카테고리에만 붙는다 (1Depth 의 is_product_list 는 비활성 값)
        parentId: { not: null },
        isProductList: true,
        // 사내전용 카테고리는 비사내 사용자에게 이름 자체를 노출하지 않는다
        ...(internal ? {} : { isInternalOnly: false, parent: { isInternalOnly: false } }),
      },
      select: {
        id: true,
        categoryCode: true,
        name: true,
        sortOrder: true,
        isActive: true,
        parent: {
          select: { id: true, categoryCode: true, name: true, sortOrder: true, isActive: true },
        },
        productModels: {
          where: { isVisible: true },
          select: { id: true, modelCode: true, sortOrder: true },
        },
      },
      orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }, { id: "asc" }],
    });

    // 공개 자료가 1건이라도 있는 형번 — 존재 여부만 필요하므로 distinct 로 한 번에 받는다.
    const modelIds = categories.flatMap((c) => c.productModels.map((m) => m.id));
    const now = new Date();
    const linked =
      modelIds.length === 0
        ? []
        : await prisma.contentProductModel.findMany({
            where: {
              productModelId: { in: modelIds },
              // 조회 조건(`productModelVisibilityFilter`)과 같은 범위로 센다. 카테고리나 그
              // 1Depth 부모가 사용중지면 `/api/products` 가 그 형번을 빼므로, 여기서 세면
              // 「자료 있음」으로 보이는데 선택하면 0건이 되는 불일치가 생긴다.
              productModel: { category: { isActive: true, parent: { isActive: true } } },
              content: {
                status: "published",
                ...(internal ? {} : publishedTargetFilter(user ? user.role : null, now)),
              },
            },
            select: { productModelId: true },
            distinct: ["productModelId"],
          });
    const withDocuments = new Set(linked.map((l) => l.productModelId));

    // 표시순서는 중복을 허용하므로 동순위는 형번명 昇順으로 확정한다 (2026-10-08 리뷰 결정).
    const data = categories.map((c) => ({
      ...c,
      productModels: [...c.productModels]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || modelCodeCollator.compare(a.modelCode, b.modelCode),
        )
        .map((m) => ({ ...m, hasDocuments: withDocuments.has(m.id) })),
    }));

    return NextResponse.json({
      data,
      meta: { enabled: data.length > 0 },
    });
  } catch (error) {
    logError("GET /api/products/axis", error);
    return NextResponse.json({ error: "型番軸の取得に失敗しました" }, { status: 500 });
  }
}
