import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isInternalUser } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { checkSearchRateLimit, escapeLikePattern } from "@/lib/content-search";
import { publishedTargetFilter } from "@/lib/content-visibility";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_MODEL_CATEGORY_SELECT,
  productModelVisibilityFilter,
} from "@/lib/product-model";
import { MODEL_CODE_SEARCH_MIN, suggestQuerySchema } from "@/lib/schemas/product-model";

/**
 * GET /api/search/suggest — 통합검색 자동완성 (REQ-001).
 *
 * 목업 `updateSuggest()` 의 서버 구현. 규칙을 그대로 옮겼다:
 *   - **3자 이상**에서만 후보를 낸다. 미달이면 400 이 아니라 **빈 결과**다
 *     (타이핑 중 매 글자마다 에러를 내지 않는다)
 *   - 후보 대상은 **형번 + 콘텐츠 제목뿐**. 첨부파일명과 본문은 보지 않는다
 *     (본문 제외는 §5-① 확정, 첨부파일명은 목업 주석의 명시 제외 항목)
 *   - **조회 가능한 자료가 있는 것만** 후보가 된다 (Redmine #2748, 2026-11-03 회의 예외처리 ③).
 *     자료 후보는 `contentWhere` 가 이미 그 역할을 하고, 제품 후보는 아래 `contents.some` 이 한다.
 *     판정은 **보는 사람 기준**이라 사내 사용자에게 후보가 더 많이 나온다
 *   - 표시 순서는 `[제품]` → `[자료]`, 종류별 기본 4건
 *
 * 제품 후보의 부제(목업 `p.status==="eol" ? "販売終了品" : p.cat`)는 **카테고리명으로만**
 * 내려보낸다. 형번 마스터에 제품상태 컬럼이 없기 때문이다 — 목업 03 형번관리 폼에서도
 * 「製品ステータスは管理項目から外した」 로 확정됐고, 제품상태는 콘텐츠의 분류축이다.
 *
 * 자료 후보의 부제(資料種別)는 서버가 축을 고르지 않고 분류 트리를 그대로 내려보낸다 —
 * 어느 1Depth 축이 `資料種別` 인지는 카테고리 마스터 데이터이지 코드 상수가 아니다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    const internal = user ? isInternalUser(user.role) : false;

    const query = suggestQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!query.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: query.error.issues },
        { status: 400 },
      );
    }

    const keyword = query.data.q.trim();
    const limit = query.data.limit;

    if (keyword.length < MODEL_CODE_SEARCH_MIN) {
      return NextResponse.json({ data: { products: [], contents: [] } });
    }

    // 타이핑마다 호출되는 경로라 rate limit 을 쿼리 전에 둔다.
    // `/api/contents` 검색과 키를 분리해, 자동완성 폭주가 본검색을 막지 않게 한다.
    if (!internal) {
      const limited = checkSearchRateLimit(request, "suggest", user?.userId ?? null);
      if (limited) return limited;
    }

    const now = new Date();
    // 입력한 `%`·`_` 를 와일드카드로 해석하지 않는다 — 본검색(buildKeywordCondition)과 같은 기준.
    const keywordPattern = escapeLikePattern(keyword);
    const contentWhere: Prisma.ContentWhereInput = {
      status: "published",
      title: { contains: keywordPattern },
      ...(internal ? {} : publishedTargetFilter(user ? user.role : null, now)),
    };

    const [products, contents] = await Promise.all([
      prisma.productModel.findMany({
        where: {
          ...productModelVisibilityFilter(internal),
          modelCode: { contains: keywordPattern },
          // 공개 자료가 **한 건이라도 연결된** 형번만 후보로 낸다 (Redmine #2748, 예외처리 ③).
          // 후보는 검색어를 바꾸는 게 아니라 제품상세로 가는 바로가기라서, 자료 0건 형번을
          // 내보내면 들어간 화면이 비어 있다. 범위는 사이드바 형번의
          // `hasDocuments`(`/api/products/axis`) 와 **같아야 한다** — 갈라지면 「좌측에서는
          // 비활성인데 자동완성에는 뜬다」가 된다.
          contents: {
            some: {
              content: {
                status: "published",
                ...(internal ? {} : publishedTargetFilter(user ? user.role : null, now)),
              },
            },
          },
        },
        include: { category: PRODUCT_MODEL_CATEGORY_SELECT },
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { modelCode: "asc" }],
        take: limit,
      }),
      prisma.content.findMany({
        where: contentWhere,
        select: {
          id: true,
          title: true,
          categories: { include: { category: CATEGORY_TREE_INCLUDE } },
        },
        // [자료] 는 **최신 등록일순** — 요구사항정의서 v1.1 REQ-001 「[자료] 최신 등록일 순으로
        // 상위에 표시」, 목업 업무리뷰 결정사항(2026-10-20)도 동일. 갱신일(updatedAt)이 아니다 —
        // 오래된 자료를 한 번 손보면 신규 자료보다 위로 올라와 버린다.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: {
        products: products.map((p) => ({
          id: p.id,
          modelCode: p.modelCode,
          category: p.category,
        })),
        contents: contents.map((c) => ({
          id: c.id,
          title: c.title,
          categories: buildCategoryTree(c.categories, { includeInternal: internal }),
        })),
      },
    });
  } catch (error) {
    logError("GET /api/search/suggest", error);
    return NextResponse.json({ error: "検索候補の取得に失敗しました" }, { status: 500 });
  }
}
