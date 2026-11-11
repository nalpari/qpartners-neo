import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isInternalUser } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import {
  buildKeywordCondition,
  buildModelCodeCondition,
  checkSearchRateLimit,
  tokenizeKeyword,
} from "@/lib/content-search";
import { publishedTargetFilter, resolveFacetConditions } from "@/lib/content-visibility";
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
 *   - 공백으로 단어를 둘 이상 넣으면 목록과 같은 토큰화·`keywordOp` 결합을 쓴다 (Redmine #2751).
 *     3자 게이트는 **나눈 단어마다** 걸린다 — 2자 이하 단어는 버리고, 남는 단어가 없으면 빈 결과다
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
    const { limit, facetCategoryIds, productModelIds, keywordOp } = query.data;

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

    // 목록에 걸린 분류 조건을 **그대로** 적용한다 — 후보와 목록이 같은 모집합에서 나와야
    // 「후보에는 뜨는데 목록에는 없다」가 생기지 않는다 (2026-11-06 사용자 확정).
    // 판정 로직은 `/api/contents`·`/api/products` 와 같은 함수를 쓴다.
    const facetConditions = await resolveFacetConditions(facetCategoryIds ?? [], {
      internal,
      roleCode: user ? user.role : null,
      now,
    });
    // 분류 체크는 있었는데 예외처리 ③ 이 전부 걸러 조건이 0개가 된 경우 — 목록이 0건이므로
    // 후보도 없다.
    if (facetConditions.unsatisfiable) {
      return NextResponse.json({ data: { products: [], contents: [] } });
    }
    /** 목록과 같은 자료 범위 — 공개·노출범위 + 분류 조건. 키워드는 축마다 다르므로 뺀다. */
    const visibleContentWhere: Prisma.ContentWhereInput = {
      status: "published",
      ...(internal ? {} : publishedTargetFilter(user ? user.role : null, now)),
      ...(facetConditions.conditions.length > 0 && { AND: facetConditions.conditions }),
    };

    // 키워드 조건은 목록과 **같은 함수**로 만든다 (Redmine #2751).
    //
    // 종전에는 입력 전체를 한 덩어리 LIKE 로 썼다. 그래서 `re.rise q.tron` 처럼 공백으로 단어를
    // 둘 이상 넣으면 목록은 나오는데 후보만 0건이었고, 이 증상은 AND·OR 양쪽에서 같았다
    // (자동완성이 `keywordOp` 를 아예 받지 않았다).
    //
    // 3자 게이트는 **단어마다** 적용한다 (2026-11-11 사용자 확정). 자동완성은 3자 이상에서만
    // 후보를 낸다는 것이 기능 전제이고, 그 전제를 나눈 단어에도 그대로 적용한다.
    // 그래서 `Q.TRON TE` 는 `Q.TRON` 만으로 후보를 낸다.
    //
    // ⚠️ #2751 note-4(「3글자를 입력한 경우에만 … 1글자씩은 제공하지 않습니다」)를 근거로 삼지
    // 말 것. 그 답변은 질문의 `a b c` 를 단어 예시가 아니라 한 글자 입력으로 읽은 것이어서
    // 복수 키워드에 대한 사양이 아니다.
    //
    // ⚠️ 목록은 전체 검색어만 3자로 끊고 나눈 단어의 길이는 보지 않는다(`tokenizeKeyword`).
    // 즉 2자 단어가 섞인 입력에서는 후보와 목록의 건수가 다를 수 있다 — **의도된 차이**다.
    //
    // LIKE 메타문자 이스케이프는 두 빌더가 내부에서 처리한다 — 여기서 미리 하면 이중 이스케이프다.
    const keywordTokens = tokenizeKeyword(keyword).filter(
      (t) => t.length >= MODEL_CODE_SEARCH_MIN,
    );
    // 3자 이상 단어가 하나도 없으면 빈 결과다. 조건 없이 내려가면 키워드와 무관한 전 자료가
    // 후보로 나온다 (`ab cd` 는 전체 길이 게이트는 통과한다).
    if (keywordTokens.length === 0) {
      return NextResponse.json({ data: { products: [], contents: [] } });
    }
    const keywordCondition = buildKeywordCondition(keywordTokens, keywordOp);
    const modelCodeCondition = buildModelCodeCondition(keywordTokens, keywordOp);

    // 분류 조건과 키워드 조건을 **한 `AND` 배열**에 모은다. 둘 다 최상위 `AND` 키를 쓸 수 있어
    // 객체 스프레드로 합치면 한쪽이 지워진다.
    const contentAndConditions: Prisma.ContentWhereInput[] = [
      ...facetConditions.conditions,
      ...(keywordCondition ? [keywordCondition] : []),
    ];
    const contentWhere: Prisma.ContentWhereInput = {
      ...visibleContentWhere,
      ...(contentAndConditions.length > 0 && { AND: contentAndConditions }),
    };

    const [products, contents] = await Promise.all([
      prisma.productModel.findMany({
        where: {
          ...productModelVisibilityFilter(internal),
          // 형번도 목록(`/api/products`)과 같은 빌더를 쓴다. `AND` 배열로 감싸는 이유는
          // 위 `contentAndConditions` 와 같다 — 빌더가 `AND`/`OR` 중 어느 키를 내도 안전하다.
          ...(modelCodeCondition ? { AND: [modelCodeCondition] } : {}),
          // 좌측에서 사용자가 직접 고른 형번이 있으면 그 안에서만 낸다 — 목록과 같은 조건이다.
          ...(productModelIds && productModelIds.length > 0
            ? { id: { in: productModelIds } }
            : {}),
          // 공개 자료가 **한 건이라도 연결된** 형번만 후보로 낸다 (Redmine #2748, 예외처리 ③).
          // 후보는 검색어를 바꾸는 게 아니라 제품상세로 가는 바로가기라서, 자료 0건 형번을
          // 내보내면 들어간 화면이 비어 있다. 범위는 사이드바 형번의
          // `hasDocuments`(`/api/products/axis`) 와 **같아야 한다** — 갈라지면 「좌측에서는
          // 비활성인데 자동완성에는 뜬다」가 된다.
          //
          // ⚠️ 분류 조건도 여기 들어간다 — 제품일람 목록이 「분류 조건을 통과한 자료가 걸린
          // 형번」을 세기 때문이다. 빼면 분류를 좁혔을 때 목록에 없는 형번이 후보에 남는다.
          contents: { some: { content: visibleContentWhere } },
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
