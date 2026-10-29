import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isInternalUser, requireMenuPermission } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { resolveBadgeFlags } from "@/lib/content-new-badge";
import {
  buildKeywordCondition,
  checkSearchRateLimit,
  escapeLikePattern,
  hasTitleMatch,
  SEARCH_BODY,
  tokenizeKeyword,
} from "@/lib/content-search";
import {
  publishedTargetFilter,
  resolveFacetConditions,
} from "@/lib/content-visibility";
import { ensureAuthorTarget } from "@/lib/contents-author-target";
import {
  reconcileInlineImages,
  unlinkInlineImages,
} from "@/lib/inline-image-cleanup";
import { jstHourStart } from "@/lib/jst-day";
import {
  findMissingRequiredAxes,
  missingAxesMessage,
} from "@/lib/content-required-axes";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_MODEL_CATEGORY_SELECT,
  assertProductModelIds,
  deriveProductStatus,
} from "@/lib/product-model";
import {
  createContentSchema,
  listContentsQuerySchema,
} from "@/lib/schemas/content";
import { INTERNAL_ROLE_CODES } from "@/lib/content-internal-only";

// GET /api/contents — 콘텐츠 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = listContentsQuerySchema.safeParse(params);

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
      categoryIds,
      facetCategoryIds,
      productModelIds,
      status,
      roleCode,
      department,
      internalOnly,
      facets,
      sort,
      sortField,
      sortCategoryCode,
      sortTargets,
      sortDir,
    } = query.data;

    const internal = user ? isInternalUser(user.role) : false;

    // 비사내 사용자는 published만 조회 가능
    const effectiveStatus = internal ? status : "published";

    // sortCategoryCode/sortTargets 는 Prisma ORM 단독으로 정렬 불가한 경로로,
    // 1단계 ID 조회 → 2단계 $queryRaw 정렬 → 3단계 페이지 fetch 의 3단계 파이프라인을 사용한다.
    // sortField=updatedAt 은 동일 3단계 구조지만, 1단계에서 정렬 키 컬럼(createdAt/updatedAt)도
    // 함께 select하고 2단계는 $queryRaw 대신 인메모리 정렬이다 (아래 else if 분기 참조).
    // 전체 row 인메모리 로드는 발생하지 않는다.

    // sortTargets: 掲示対象 컬럼은 UI에서 isInternal 분기 안에서만 렌더링되므로 사내 전용.
    // 비사내 사용자가 직접 API를 호출해도 의미 없는 정보이며, 공개 경로의 DB 부하 방지를 위해 차단.
    if (sortTargets === true && !internal) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // AND 조건 배열로 중복 relation(categories/targets) 필터를 안전하게 조합.
    // plain object 에 같은 key 를 두 번 쓰면 뒤의 값이 앞을 덮어쓰므로 AND 배열이 필요.
    const andConditions: Prisma.ContentWhereInput[] = [];

    // 카테고리 필터 — AND(교집합) 조건. 선택한 카테고리를 **전부** 가진 콘텐츠만 반환한다.
    // (예: 太陽電池モジュール + パワーコンディショナ 선택 시 둘 다 매핑된 콘텐츠만)
    //
    // `categories: { some: { categoryId: { in: [...] } } }` 는 OR 이며, SQL JOIN 으로
    // 컴파일되어 count/findMany 가 매핑 행 수만큼 콘텐츠를 중복 카운트하는 문제도 있었다
    // (예: 営業 단일 0건, 技術 단일 1건인데 멀티 선택 시 2건).
    //
    // 따라서 `ContentCategory` 에서 선택 카테고리 매핑 행만 조회한 뒤 contentId 별로 세어,
    // 매칭 수가 선택 수와 같은 콘텐츠만 골라 `id IN [...]` 로 변환한다. 콘텐츠 단위로
    // 정확히 집계되며, `@@id([contentId, categoryId])` 복합 PK 라 중복 행이 없어
    // 카운트가 곧 매칭 개수다. 추가 쿼리 1회 비용은 contentId 만 select 하므로 가볍다.
    //
    // Number("")==0, !isNaN(0)==true 로 0 이 통과되는 것을 막기 위해 양의 정수만 허용.
    // Number.isInteger 는 NaN/Infinity 도 제외하므로 isFinite 중복 불필요.
    // 중복 id 가 들어오면 선택 수가 부풀려져 교집합이 항상 0 이 되므로 Set 으로 제거.
    // sortCategoryCode 단일 SQL 분기에서 재사용하므로 스코프 밖으로 호이스트
    let filteredContentIds: number[] | null = null;
    let categoryEmpty = false;
    if (categoryIds) {
      const parsedIds = [
        ...new Set(
          categoryIds
            .split(",")
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        ),
      ];
      if (parsedIds.length > 0) {
        let ccRows: { contentId: number }[];
        try {
          ccRows = await prisma.contentCategory.findMany({
            where: { categoryId: { in: parsedIds } },
            select: { contentId: true },
          });
        } catch (dbError: unknown) {
          logError("GET /api/contents categoryIds 필터조회", dbError, { parsedIds });
          return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
        }
        // contentId 별 매칭 카테고리 수를 세어 선택 수와 일치하는 것만 = 교집합(AND).
        // distinct 를 걷어낸 이유는 행 수 자체가 집계 근거이기 때문 —
        // 복합 PK 라 (contentId, categoryId) 중복 행이 없으므로 카운트가 곧 매칭 개수다.
        const matchCounts = new Map<number, number>();
        for (const r of ccRows) {
          matchCounts.set(r.contentId, (matchCounts.get(r.contentId) ?? 0) + 1);
        }
        const ids = [...matchCounts]
          .filter(([, count]) => count === parsedIds.length)
          .map(([contentId]) => contentId);
        if (ids.length === 0) {
          // 매핑된 콘텐츠가 없음 → fast-path 0 응답
          categoryEmpty = true;
        } else {
          filteredContentIds = ids;
          andConditions.push({ id: { in: filteredContentIds } });
        }
      }
    }

    // 분류축(facet) 필터 — 검색 고도화 REQ-002/004. 축 안에서는 OR, 축 사이는 AND.
    // 위 categoryIds(교집합) 와 의미가 다른 별개 파라미터다 — 현행 목록 화면이 categoryIds 를
    // 쓰고 있어 그대로 두고, 신규 사이드바만 이 축 방식을 쓴다.
    // 체크된 축만 조건이 된다 — 체크가 없으면 빈 조건이다 (거르지 않는다).
    const facetConditions = await resolveFacetConditions(facetCategoryIds ?? []);
    // ⚠️ 축 조건은 `andConditions`(그 외 전부)와 **따로 모은다**. REQ-004 의 「키워드 연동
    // 카테고리 체크」 집계가 **축 조건을 뺀 집합**을 세야 하기 때문이다 — 체크 결과로 다시
    // 세면 「해제 → 결과 변함 → 또 해제」가 연쇄해 상태가 수렴하지 않는다
    // (목업 `01-search.html:2247` 주석).
    const axisConditions: Prisma.ContentWhereInput[] = [];
    axisConditions.push(...facetConditions.conditions);

    // 型番 축 — 선택한 형번에 紐づく 자료만. 목업은 제품일람 탭에서만 이 축을 적용하지만,
    // 서버는 파라미터가 오면 그대로 거른다 (제품상세의 자료 목록도 같은 조건을 쓴다).
    if (productModelIds && productModelIds.length > 0) {
      axisConditions.push({
        productModels: { some: { productModelId: { in: productModelIds } } },
      });
    }

    if (categoryEmpty) {
      return NextResponse.json({
        data: [],
        meta: { total: 0, page, pageSize, totalPages: 0 },
      });
    }

    // publication window 경계값 일관성 — 동일 where 절 안의 now 를 상수화.
    // (findMany / count 가 Promise.all 로 병렬 실행되어도 같은 스냅샷 사용)
    const now = new Date();
    // 게시 **종료** 경계는 "종료 시각이 속한 시간대의 끝까지" 다 — `canAccessContent`(auth.ts)
    // 와 `publishedTargetFilter`(content-visibility.ts) 가 쓰는 기준과 같아야 한다.
    // 아래 raw SQL 분기(sortCategoryCode 정렬)가 `now` 로 비교하고 있어, 14:00 종료 자료가
    // 목록에는 보이는데 카테고리 정렬을 누르면 사라지는 최대 59분의 틈이 있었다.
    const nowHour = jstHourStart(now);

    if (internal) {
      // 사내 사용자 (관리 목적):
      // - internalOnly=true → 외부 게시대상(비-INTERNAL_ROLE_CODES 또는 null=비회원)이
      //   하나도 없는 게시글만. internalOnly 체크 시 roleCode 파라미터는 무시 — UI 에서도 disabled
      // - internalOnly=false && roleCode 지정 → 해당 roleCode 필터 (null = 비회원 검색)
      // - 둘 다 미지정 → 전체 열람
      //
      // 정책 주석: 사내 분기는 publication window(startAt/endAt) 를 의도적으로 미적용.
      //           예정/만료 게시글을 관리자 패널에서 함께 점검할 수 있게 함.
      if (internalOnly) {
        andConditions.push({
          targets: {
            none: {
              OR: [
                { roleCode: null }, // 비회원 게시대상 행
                { roleCode: { notIn: [...INTERNAL_ROLE_CODES] } }, // 외부 권한 행
              ],
            },
          },
        });
      } else if (roleCode !== undefined) {
        // null = 비회원 검색, string = 권한코드 일치 (신규 권한 D 도 포함)
        andConditions.push({ targets: { some: { roleCode } } });
      }
    } else {
      // 비사내 사용자:
      // - 노출 결정은 게시대상(ContentTarget) 만으로 한다 (운영 정책 갱신).
      //   카테고리는 분류 라벨일 뿐 노출 차단 기준이 아니며, 사내 전용 카테고리 라벨은
      //   응답 시점의 buildCategoryTree({ includeInternal: false }) 가 자동 제외한다.
      //   → 콘텐츠 자체는 게시대상 매칭 시 노출되되 사내 전용 카테고리 라벨만 숨김.
      // - 역할 기반으로 roleCode 서버 강제 (쿼리 파라미터 무시).
      //   비로그인(user=null) → roleCode IS NULL (비회원 게시대상) 매칭.
      // - publication window 엄격 적용
      // 노출기간 시각 비교 기준은 canAccessContent(auth.ts) 와 동일하다.
      // 제품일람·제품상세·자동완성도 같은 판정을 써야 하므로 헬퍼로 뽑혀 있다.
      andConditions.push(publishedTargetFilter(user ? user.role : null, now));
    }

    // Prisma where 절과 raw SQL 분기가 같은 토큰 배열을 공유해야 결과가 일치한다.
    const keywordTokens = tokenizeKeyword(keyword);

    // 키워드 검색 조건 — 제목 / 첨부파일명 / 형번. 본문은 제외(lib/content-search.ts SEARCH_BODY).
    // 결합 규칙과 형번 매칭 범위는 buildKeywordCondition 주석 참조.
    // ⚠️ sortCategoryCode 분기가 같은 조건을 raw SQL 로 다시 쓴다 — 함께 유지할 것.
    const keywordCondition = buildKeywordCondition(keywordTokens, keywordOp);

    /** 축(분류·형번) 조건을 **뺀** where — REQ-004 집계 전용. */
    const axisFreeWhere: Prisma.ContentWhereInput = {
      status: effectiveStatus as "draft" | "published" | "deleted",
      ...(keywordCondition ?? {}),
      ...(department && department.length > 0 && { authorDepartment: { in: department } }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const where: Prisma.ContentWhereInput = {
      ...axisFreeWhere,
      ...(andConditions.length + axisConditions.length > 0 && {
        AND: [...andConditions, ...axisConditions],
      }),
    };

    // 비사내 공개 경로 rate limit — DB 부하 방지 (IP당 60회/분, IP 불명 시 20회/분).
    //
    // 대상은 인덱스로 값싸게 처리되지 않는 두 경로:
    //   - keyword 검색 — title/body 선행 와일드카드 LIKE + attachments 상관 EXISTS(fileName LIKE).
    //     findMany 와 count 가 각각 평가하므로 불일치 검색어를 반복해도 매번 full 비용이 든다.
    //   - sortCategoryCode — 카테고리 자식명 기준 정렬 raw SQL.
    // 단순 페이징(keyword·정렬 없음)은 제외한다 — NAT 뒤 공유 IP 에서 일반 열람이 막히지 않도록.
    //
    // 쿼리 실행 전에 둔다 — 차단 대상 요청이 DB 를 한 번도 건드리지 않아야 의미가 있다.
    if (!internal && (keyword || sortCategoryCode)) {
      const limited = checkSearchRateLimit(request, "contents-search", user?.userId ?? null);
      if (limited) return limited;
    }

    const includeOptions = {
      categories: {
        include: { category: CATEGORY_TREE_INCLUDE },
      },
      targets: { select: { roleCode: true, startAt: true, endAt: true } },
      _count: { select: { attachments: true } },
      // 자료일람 `製品ステータス` 컬럼용 — REQ-005 는 이 값을 **연결된 형번에서 파생**하라고
      // 규정한다(자료는 제품상태를 직접 갖지 않는다). 상태만 있으면 되므로 형번 전체를
      // 싣지 않고 `status` 한 컬럼만 가져온다.
      //
      // ⚠️ 노출 필터(`productModelVisibilityFilter`)를 걸지 않는다 — 비표시 형번을 빼면
      // 그것이 유일한 現行品 일 때 판정이 販売終了品 으로 뒤집힌다. 파생은 연결된 형번
      // **전부**를 본다(`deriveProductStatus` 주석 참조).
      productModels: { select: { productModel: { select: { status: true } } } },
    } as const;

    // isNew/isUpdated 계산용 — where 절의 now 와 동일 스냅샷 사용 (정책 일관성)
    const nowMs = now.getTime();
    // New 뱃지 기준은 등록일이 아니라 공개일 — 사내는 가장 빠른 공개일, 그 외는 자기 권한의 공개일.
    const viewer = { internal, roleCode: user ? user.role : null };
    const mapRow = (c: Prisma.ContentGetPayload<{ include: typeof includeOptions }>) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      authorDepartment: c.authorDepartment,
      // 사내 사용자에게만 approverLevel 제공 — 목록 화면 최종확인자 컬럼용
      approverLevel: internal ? c.approverLevel : undefined,
      viewCount: c.viewCount,
      publishedAt: c.publishedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      // 갱신 이력 판별 서버 단일 출처 — 클라이언트 Date 비교 제거용
      hasBeenUpdated: c.updatedAt.getTime() !== c.createdAt.getTime(),
      // NEW/UPDATE 는 함께 판정한다 — 공개일 도래 전에는 둘 다 false (사내 전용 노출 구간).
      ...resolveBadgeFlags(c, c.targets, viewer, nowMs),
      categories: buildCategoryTree(c.categories, { includeInternal: internal }),
      targets: c.targets,
      attachmentCount: c._count.attachments,
      // 하나라도 現行品 → current / 전부 販売終了品 → eol / 연결 없음 → null(화면에서 「-」)
      productStatus: deriveProductStatus(c.productModels.map((l) => l.productModel)),
    });

    let data: ReturnType<typeof mapRow>[] = [];
    let total = 0;

    if (sortCategoryCode) {
      // DB 정렬: 카테고리 자식명 기준.
      // 전체 ID materialization 없이 WHERE + 정렬 + 페이지네이션 + COUNT를 단일 SQL로 처리.
      // children[0] 은 sortOrder ASC → id ASC 기준 (buildCategoryTree 및 클라이언트 getFirstCategoryChildName 과 동일).

      // WHERE 조건을 SQL fragment로 직접 구성 — Prisma WHERE와 동일한 필터 로직
      const sqlConds: Prisma.Sql[] = [
        Prisma.sql`c.status = ${effectiveStatus}`,
      ];

      if (keywordTokens.length > 0) {
        // buildKeywordCondition(lib/content-search.ts) 과 **동일 조건**의 raw SQL 판본이다.
        // 한쪽만 고치면 카테고리 정렬 상태에서만 검색 결과가 달라진다 — 함께 유지할 것.
        // 사용자가 입력한 `%`·`_` 는 와일드카드가 아니라 글자로 다룬다(escapeLikePattern).
        // `ESCAPE '\\'` 를 명시해 `NO_BACKSLASH_ESCAPES` sql_mode 에서도 같게 동작시킨다.
        const kws = keywordTokens.map((t) => `%${escapeLikePattern(t)}%`);
        const glue = keywordOp === "AND" ? " AND " : " OR ";
        const titleCond = Prisma.join(
          kws.map((k) => Prisma.sql`c.title LIKE ${k} ESCAPE '\\'`),
          glue,
        );
        const modelCond = Prisma.join(
          kws.map((k) => Prisma.sql`pm.model_code LIKE ${k} ESCAPE '\\'`),
          glue,
        );
        // 본문(c.body)은 검색 대상에서 빠졌다 — SEARCH_BODY 플래그로 되살릴 때 이 분기도 함께.
        const bodyGroup = SEARCH_BODY
          ? Prisma.sql` OR (${Prisma.join(
              kws.map((k) => Prisma.sql`c.body LIKE ${k} ESCAPE '\\'`),
              glue,
            )})`
          : Prisma.empty;
        // 첨부파일명(qp_content_attachments.file_name)은 검색 대상이 아니다 — REQ-001.
        sqlConds.push(Prisma.sql`((${titleCond})${bodyGroup} OR EXISTS (
          SELECT 1 FROM qp_content_product_models cpm
          JOIN qp_product_models pm ON cpm.product_model_id = pm.id
          WHERE cpm.content_id = c.id AND pm.is_visible = 1 AND (${modelCond})
        ))`);
      }

      if (department && department.length > 0) {
        sqlConds.push(Prisma.sql`c.author_department IN (${Prisma.join(department)})`);
      }

      // 분류축(facet) — resolveFacetConditions 의 Prisma 조건과 **동일해야 한다**.
      // 축 안 OR / 축 사이 AND, 그리고 연결이 없는 콘텐츠도 탈락(엄격, 규칙 2).
      // 여기가 갈라지면 "정렬을 걸면 건수가 달라지는" 증상이 난다.
      for (const group of facetConditions.groups) {
        sqlConds.push(Prisma.sql`EXISTS (
          SELECT 1 FROM qp_content_categories fcc
          WHERE fcc.content_id = c.id AND fcc.category_id IN (${Prisma.join(group.categoryIds)})
        )`);
      }

      // 型番 축
      if (productModelIds && productModelIds.length > 0) {
        sqlConds.push(Prisma.sql`EXISTS (
          SELECT 1 FROM qp_content_product_models mcpm
          WHERE mcpm.content_id = c.id
            AND mcpm.product_model_id IN (${Prisma.join(productModelIds)})
        )`);
      }

      if (filteredContentIds !== null) {
        sqlConds.push(Prisma.sql`c.id IN (${Prisma.join(filteredContentIds)})`);
      }

      // targets 필터 — Prisma andConditions의 targets 조건을 SQL EXISTS로 재현
      if (internal) {
        if (internalOnly) {
          // targets.none { OR [roleCode=null, roleCode NOT IN INTERNAL_ROLE_CODES] }
          // = 외부 게시대상(비사내 row)이 하나도 없음 → 사내 전용 콘텐츠
          sqlConds.push(Prisma.sql`NOT EXISTS (
            SELECT 1 FROM qp_content_targets ct
            WHERE ct.content_id = c.id
              AND (ct.role_code IS NULL OR ct.role_code NOT IN (${Prisma.join([...INTERNAL_ROLE_CODES])}))
          )`);
        } else if (roleCode !== undefined) {
          if (roleCode === null) {
            sqlConds.push(Prisma.sql`EXISTS (
              SELECT 1 FROM qp_content_targets ct
              WHERE ct.content_id = c.id AND ct.role_code IS NULL
            )`);
          } else {
            sqlConds.push(Prisma.sql`EXISTS (
              SELECT 1 FROM qp_content_targets ct
              WHERE ct.content_id = c.id AND ct.role_code = ${roleCode}
            )`);
          }
        }
      } else {
        // 비사내: 세션 역할 기반 게시대상 + 게시기간 필터 (Prisma WHERE와 동일 — 시각 비교)
        const userRole = user?.role ?? null;
        if (userRole === null) {
          sqlConds.push(Prisma.sql`EXISTS (
            SELECT 1 FROM qp_content_targets ct
            WHERE ct.content_id = c.id
              AND ct.role_code IS NULL
              AND (ct.start_at IS NULL OR ct.start_at <= ${now})
              AND (ct.end_at IS NULL OR ct.end_at >= ${nowHour})
          )`);
        } else {
          sqlConds.push(Prisma.sql`EXISTS (
            SELECT 1 FROM qp_content_targets ct
            WHERE ct.content_id = c.id
              AND ct.role_code = ${userRole}
              AND (ct.start_at IS NULL OR ct.start_at <= ${now})
              AND (ct.end_at IS NULL OR ct.end_at >= ${nowHour})
          )`);
        }
      }

      const whereSql = Prisma.join(sqlConds, " AND ");

      // 비사내 사용자는 사내 전용 카테고리를 정렬 키에서도 제외 (buildCategoryTree 와 동일 정책)
      const internalOnlyFilter = internal
        ? Prisma.empty
        : Prisma.sql`AND ch.is_internal_only = 0 AND par.is_internal_only = 0`;
      const dir = sortDir ?? "asc";
      const sortDirSql = dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const offset = (page - 1) * pageSize;

      // 1단계: 정렬 + 페이지네이션 + COUNT 동시 실행 (전체 ID IN 절 불필요)
      // $queryRaw 제네릭 파라미터는 컴파일 타임 단언. Number()로 BigInt 도달 시에도 안전하게 변환.
      let sortedRows: { id: number | bigint; sort_key: string | null }[];
      let countRows: [{ total: bigint }];
      try {
        [sortedRows, countRows] = await Promise.all([
          prisma.$queryRaw<{ id: number | bigint; sort_key: string | null }[]>`
            SELECT c.id,
              (
                SELECT ch.name
                FROM qp_content_categories cc
                JOIN qp_categories ch ON cc.category_id = ch.id
                JOIN qp_categories par ON ch.parent_id = par.id
                WHERE cc.content_id = c.id
                  AND par.category_code = ${sortCategoryCode}
                  AND ch.is_active = 1
                  AND par.is_active = 1
                  ${internalOnlyFilter}
                ORDER BY ch.sort_order ASC, ch.id ASC
                LIMIT 1
              ) AS sort_key
            FROM qp_contents c
            WHERE ${whereSql}
            ORDER BY (sort_key IS NULL) ASC, sort_key ${sortDirSql}, c.created_at DESC, c.id ASC
            LIMIT ${pageSize} OFFSET ${offset}
          `,
          prisma.$queryRaw<[{ total: bigint }]>`
            SELECT COUNT(*) AS total FROM qp_contents c WHERE ${whereSql}
          `,
        ]);
      } catch (dbError: unknown) {
        logError("GET /api/contents sortCategoryCode 정렬쿼리", dbError, { sortCategoryCode });
        return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
      }

      total = Number(countRows[0].total);
      const pageIds = sortedRows.map((r) => Number(r.id));

      if (pageIds.length === 0) {
        data = [];
      } else {
        // 2단계: 페이지 콘텐츠 full fetch + $queryRaw 정렬 순서 복원
        // where 재적용: SQL 쿼리와 full fetch 사이 레이스 컨디션(상태 변경 등)으로
        // 접근 불가 콘텐츠가 응답에 포함되지 않도록 원본 where 조건을 유지한다.
        let pageRows: Prisma.ContentGetPayload<{ include: typeof includeOptions }>[];
        try {
          pageRows = await prisma.content.findMany({
            where: { AND: [where, { id: { in: pageIds } }] },
            include: includeOptions,
          });
        } catch (dbError: unknown) {
          logError("GET /api/contents sortCategoryCode 페이지조회", dbError, { sortCategoryCode });
          return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
        }
        // findMany 는 IN 순서를 보장하지 않으므로 $queryRaw 순서로 재정렬
        const rowById = new Map(pageRows.map((r) => [r.id, r]));
        data = pageIds.flatMap((id) => {
          const row = rowById.get(id);
          if (!row) {
            // 정상 흐름(레이스컨디션) — error 수준이 아니므로 warn으로 기록
            console.warn("[GET /api/contents sortCategoryCode] 레이스컨디션 탈락", { id, sortCategoryCode });
            return [];
          }
          return [mapRow(row)];
        });
        // COUNT 쿼리가 total의 기준이므로 레이스컨디션 탈락분만 근사 보정
        const dropped = pageIds.length - data.length;
        if (dropped > 0) total = Math.max(0, total - dropped);
      }
    } else if (sortTargets === true) {
      // DB 정렬: 게시대상 roleCode rank 기준.
      // Prisma ORM 은 relation 집계값(MIN rank)에 대한 ORDER BY 를 지원하지 않으므로 $queryRaw 를 사용한다.
      // targetOrderRank(src/lib/target-role-order.ts) 와 동일 순위를 SQL CASE 로 표현.
      // ⚠️ target-role-order.ts 수정 시 아래 SQL CASE 문도 반드시 동기화할 것.
      // Repeatable Read 트랜잭션으로 1~3단계를 동일 스냅샷에서 실행 — 스냅샷 불일치(Finding 3) 해소.

      const dir = sortDir ?? "asc";
      const sortDirSql = dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const offset = (page - 1) * pageSize;

      try {
        const txResult = await prisma.$transaction(async (tx) => {
          // 1단계: where 조건 매칭 ID 목록
          const idRows = await tx.content.findMany({ where, select: { id: true } });
          const txTotal = idRows.length;

          if (txTotal === 0) {
            return { txTotal, txData: [] as ReturnType<typeof mapRow>[] };
          }

          const allIds = idRows.map((r) => r.id);

          // 2단계: MIN(rank) 서브쿼리 정렬 + 페이지네이션
          // $queryRaw 제네릭 파라미터는 컴파일 타임 단언. Number()로 BigInt 도달 시에도 안전하게 변환.
          const sortedRows = await tx.$queryRaw<{ id: number | bigint; sort_key: number | null }[]>`
            SELECT c.id,
              (
                SELECT MIN(
                  CASE ct.role_code
                    WHEN 'SUPER_ADMIN' THEN 1
                    WHEN 'ADMIN'       THEN 2
                    WHEN '1ST_STORE'   THEN 3
                    WHEN '2ND_STORE'   THEN 4
                    WHEN 'SEKO'        THEN 5
                    WHEN 'GENERAL'     THEN 6
                    ELSE CASE WHEN ct.role_code IS NULL THEN 999 ELSE 100 END
                  END
                )
                FROM qp_content_targets ct
                WHERE ct.content_id = c.id
              ) AS sort_key
            FROM qp_contents c
            WHERE c.id IN (${Prisma.join(allIds)})
            ORDER BY (sort_key IS NULL) ASC, sort_key ${sortDirSql}, c.created_at DESC, c.id ASC
            LIMIT ${pageSize} OFFSET ${offset}
          `;

          const pageIds = sortedRows.map((r) => Number(r.id));
          if (pageIds.length === 0) {
            return { txTotal, txData: [] as ReturnType<typeof mapRow>[] };
          }

          // 3단계: 페이지 콘텐츠 full fetch + $queryRaw 정렬 순서 복원
          const pageRows = await tx.content.findMany({
            where: { AND: [where, { id: { in: pageIds } }] },
            include: includeOptions,
          });

          const rowById = new Map(pageRows.map((r) => [r.id, r]));
          const txData = pageIds.flatMap((id) => {
            const row = rowById.get(id);
            if (!row) {
              // Repeatable Read 내 ID 탈락은 실제 데이터 불일치이므로 warn 기록
              console.warn("[GET /api/contents sortTargets] 트랜잭션 내 ID 탈락", { id });
              return [];
            }
            return [mapRow(row)];
          });

          return { txTotal, txData };
        }, { isolationLevel: "RepeatableRead" });

        total = txResult.txTotal;
        data = txResult.txData;
      } catch (dbError: unknown) {
        logError("GET /api/contents sortTargets DB조회", dbError, { sortTargets });
        return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
      }
    } else if (sortField === "updatedAt") {
      // 인메모리 정렬: "실제 수정 여부"(updatedAt !== createdAt, hasBeenUpdated 참조)를 기준으로 하므로
      // DB ORDER BY 로 표현 불가 → 1단계 경량 select → 인메모리 정렬 → 3단계 페이지 full fetch.
      // Repeatable Read 트랜잭션으로 1·3단계를 동일 스냅샷에서 실행 — 스냅샷 불일치(Finding 3) 해소.
      // 최종 동점 처리는 Array.prototype.sort 의 안정 정렬(Node.js v11+)에 의존하므로
      // 실행환경 변경 시 재검토가 필요하다.

      const dir = sortDir ?? "asc";

      try {
        const txResult = await prisma.$transaction(async (tx) => {
          // 1단계: 정렬 키 컬럼만 select (전체 row 인메모리 로드 방지)
          const idRows = await tx.content.findMany({
            where,
            select: { id: true, createdAt: true, updatedAt: true },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          });
          const txTotal = idRows.length;

          if (txTotal === 0) {
            return { txTotal, txData: [] as ReturnType<typeof mapRow>[] };
          }

          // 2단계: 인메모리 정렬 + 페이지 슬라이싱 (DB 조회 없음)
          const withSortKey = idRows.map((r) => ({
            id: r.id,
            key: r.updatedAt.getTime() !== r.createdAt.getTime() ? r.updatedAt.getTime() : null,
          }));
          withSortKey.sort((a, b) => {
            if (a.key === null && b.key === null) return 0;
            if (a.key === null) return 1;
            if (b.key === null) return -1;
            const cmp = a.key - b.key;
            return dir === "asc" ? cmp : -cmp;
          });
          const pageIds = withSortKey
            .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
            .map((r) => r.id);

          if (pageIds.length === 0) {
            return { txTotal, txData: [] as ReturnType<typeof mapRow>[] };
          }

          // 3단계: 페이지 콘텐츠 full fetch + 인메모리 정렬 순서 복원
          const pageRows = await tx.content.findMany({
            where: { AND: [where, { id: { in: pageIds } }] },
            include: includeOptions,
          });

          const rowById = new Map(pageRows.map((r) => [r.id, r]));
          const txData = pageIds.flatMap((id) => {
            const row = rowById.get(id);
            if (!row) {
              // Repeatable Read 내 ID 탈락은 실제 데이터 불일치이므로 warn 기록
              console.warn("[GET /api/contents sortField=updatedAt] 트랜잭션 내 ID 탈락", { id });
              return [];
            }
            return [mapRow(row)];
          });

          return { txTotal, txData };
        }, { isolationLevel: "RepeatableRead" });

        total = txResult.txTotal;
        data = txResult.txData;
      } catch (dbError: unknown) {
        logError("GET /api/contents sortField=updatedAt DB조회", dbError, { sortField });
        return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
      }
    } else if (!sortField && sort === "relevance" && keywordTokens.length > 0) {
      // 관련도 정렬 — 검색 고도화 기본 정렬(목업 `currentResults()`: 검색어가 있으면 관련도순).
      //
      // 점수는 "제목에 맞았는가" 단일 축이다. 본문이 검색 대상에서 빠진 뒤로는 제목 매칭이
      // 사실상 유일한 변별 요소이며(hasTitleMatch 주석), 제목은 1단계 select 로 이미 들어오므로
      // 추가 쿼리가 없다. 동점은 갱신일 내림차순.
      //
      // DB ORDER BY 로 표현할 수 없어 sortField=updatedAt 과 같은 3단계 구조를 쓴다:
      // 1단계 경량 select → 2단계 인메모리 정렬 → 3단계 페이지 full fetch.
      // Repeatable Read 로 1·3단계를 같은 스냅샷에서 실행한다.
      try {
        const txResult = await prisma.$transaction(async (tx) => {
          const idRows = await tx.content.findMany({
            where,
            select: { id: true, title: true, updatedAt: true },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          });
          const txTotal = idRows.length;

          if (txTotal === 0) {
            return { txTotal, txData: [] as ReturnType<typeof mapRow>[] };
          }

          const scored = idRows.map((r) => ({
            id: r.id,
            score: hasTitleMatch(r.title, keywordTokens, keywordOp) ? 1 : 0,
            updatedMs: r.updatedAt.getTime(),
          }));
          // 관련도는 항상 내림차순 — sortDir 는 헤더 클릭 정렬 전용이라 여기서는 받지 않는다
          // (listContentsQuerySchema 가 sortDir 단독 지정을 거부한다).
          scored.sort((a, b) => b.score - a.score || b.updatedMs - a.updatedMs);
          const pageIds = scored
            .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
            .map((r) => r.id);

          if (pageIds.length === 0) {
            return { txTotal, txData: [] as ReturnType<typeof mapRow>[] };
          }

          const pageRows = await tx.content.findMany({
            where: { AND: [where, { id: { in: pageIds } }] },
            include: includeOptions,
          });

          const rowById = new Map(pageRows.map((r) => [r.id, r]));
          const txData = pageIds.flatMap((id) => {
            const row = rowById.get(id);
            if (!row) {
              console.warn("[GET /api/contents sort=relevance] 트랜잭션 내 ID 탈락", { id });
              return [];
            }
            return [mapRow(row)];
          });

          return { txTotal, txData };
        }, { isolationLevel: "RepeatableRead" });

        total = txResult.txTotal;
        data = txResult.txData;
      } catch (dbError: unknown) {
        logError("GET /api/contents sort=relevance DB조회", dbError, { sort });
        return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
      }
    } else {
      // ag-grid 헤더 클릭 정렬 — sortField 지정 시 프리셋(sort)보다 우선.
      // sortField==="updatedAt" 는 위의 else if 분기에서 처리되므로 이 분기에 도달하지 않는다.
      const orderBy: Prisma.ContentOrderByWithRelationInput | null = (() => {
        if (sortField) {
          const dir = sortDir ?? "asc";
          switch (sortField) {
            case "title":
              return { title: dir };
            case "createdAt":
              return { createdAt: dir };
            case "authorDepartment":
              // nullable 필드 — DB 기본 NULL 정렬(ASC 시 앞)이 클라이언트 comparator의
              // null-last 동작과 어긋나므로 Prisma SortOrderInput으로 명시.
              return { authorDepartment: { sort: dir, nulls: "last" as const } };
            case "approverLevel":
              // nullable 필드 — authorDepartment 와 동일하게 nulls: "last" 명시.
              return { approverLevel: { sort: dir, nulls: "last" as const } };
            case "attachmentCount":
              return { attachments: { _count: dir } };
            case "viewCount":
              return { viewCount: dir };
            default: {
              // CONTENT_SORT_FIELDS 에 필드를 추가했는데 case 를 빠뜨리면 이 줄에서 컴파일 에러가
              // 나서 알아챌 수 있다 — case 누락이 컴파일 통과 후 조용히 기본 정렬로 fallback 되는 것 방지.
              const _exhaustive: never = sortField;
              logError("GET /api/contents", new Error(`처리되지 않은 sortField: ${String(_exhaustive)}`));
              return null;
            }
          }
        }
        switch (sort) {
          case "oldest":
            return { createdAt: "asc" as const };
          case "views":
            return { viewCount: "desc" as const };
          case "updated":
            return { updatedAt: "desc" as const };
          case "relevance":
            // 키워드가 없으면 관련도를 매길 수 없다 — 기본(newest)과 같게 동작한다.
            // (키워드가 있는 경우는 위 relevance 분기에서 처리되어 여기 도달하지 않는다)
            return { createdAt: "desc" as const };
          default:
            return { createdAt: "desc" as const };
        }
      })();

      if (orderBy === null) {
        return NextResponse.json({ error: "不正なソートフィールドが指定されました" }, { status: 400 });
      }

      let dbResult: [Prisma.ContentGetPayload<{ include: typeof includeOptions }>[], number];
      try {
        dbResult = await Promise.all([
          prisma.content.findMany({
            where,
            include: includeOptions,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.content.count({ where }),
        ]);
      } catch (dbError: unknown) {
        logError("GET /api/contents DB정렬 DB조회", dbError, { sortField, sort });
        return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
      }
      const [contents, contentsTotal] = dbResult;
      data = contents.map(mapRow);
      total = contentsTotal;
    }

    // REQ-004 「키워드 검색과 카테고리 필터 연동」 — 검색 결과에 **실제로 나타나는** 분류값.
    //
    // 화면은 이 목록으로 좌측 체크 상태를 갱신한다(결과에 있는 값만 체크). 집계는 축 조건을
    // 뺀 `axisFreeWhere` 로 한다 — 체크 결과로 다시 세면 연쇄해 수렴하지 않는다.
    //
    // `facets=1` 로 **명시한 요청에서만** 집계한다. 종전에는 모든 GET 이 링크 테이블
    // `distinct` 를 돌려, 집계를 쓰지 않는 관리자 목록·페이지 이동·탭 전환까지 쿼리를 더
    // 썼다. 형번축 집계도 함께 돌렸지만 쓰는 화면이 없어 걷어냈다 — 필요해지면 되살린다.
    const facetCatRows = facets
      ? await prisma.contentCategory.findMany({
          where: { content: axisFreeWhere },
          select: { categoryId: true },
          distinct: ["categoryId"],
        })
      : null;

    return NextResponse.json({
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      /** 검색 결과에 나타나는 분류값 — 좌측 체크 상태 동기화용(REQ-004). `facets=1` 일 때만 */
      ...(facetCatRows && {
        availableFacets: { categoryIds: facetCatRows.map((r) => r.categoryId) },
      }),
    });
  } catch (error) {
    logError("GET /api/contents", error);
    return NextResponse.json(
      { error: "コンテンツの取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/contents — 콘텐츠 등록
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "CONTENT", "create");
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

    let body: unknown;
    try {
      body = await request.json();
    } catch (jsonError: unknown) {
      console.warn("[POST /api/contents] Request body 파싱 실패:", jsonError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = createContentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const { targets, categoryIds, productModelIds, ...contentData } = result.data;

    // 축별 필수 분류 — 화면에서도 막지만 API 직접 호출까지 대비해 서버에서 판정한다.
    const missingAxes = await findMissingRequiredAxes(categoryIds);
    if (missingAxes.length > 0) {
      return NextResponse.json({ error: missingAxesMessage(missingAxes) }, { status: 400 });
    }

    if (productModelIds && productModelIds.length > 0) {
      const modelError = await assertProductModelIds(productModelIds);
      if (modelError) return modelError;
    }

    // 비사내 작성자의 본인 권한 강제 포함 — FE 우회 방어 (정책: lib/contents-author-target.ts).
    const effectiveTargets = ensureAuthorTarget(targets, user.role);

    // publishedAt 자동 설정
    const publishedAt =
      contentData.status === "published"
        ? (contentData.publishedAt ?? new Date())
        : undefined;

    // createdAt 은 DB default(UTC_TIMESTAMP(3)), updatedAt 은 Prisma(앱 서버)가 채우므로 값을
    // 주지 않으면 INSERT 왕복 시간만큼(실측 1~3ms) 두 값이 어긋난다. 갱신 이력 판정이
    // `updatedAt !== createdAt` 이라 등록하는 순간 "수정된 콘텐츠"가 되어 갱신일·UPDATE 뱃지가
    // 노출된다(#2476). 두 컬럼을 같은 시각으로 명시해 출처를 하나로 통일한다.
    const createdNow = new Date();

    // 본문 임베드 이미지 cleanup 을 같은 트랜잭션 안에서 수행 — 콘텐츠 INSERT 가 롤백되면
    // stamp/delete 도 자동 원복. 디스크 unlink 는 commit 후 별도 처리(실패해도 정합성 영향 없음).
    const { content, unlinkPaths } = await prisma.$transaction(async (tx) => {
      const created = await tx.content.create({
        data: {
          ...contentData,
          publishedAt,
          createdAt: createdNow,
          updatedAt: createdNow,
          userType: user.userType,
          userId: user.userId,
          createdBy: user.userId,
          authorDepartment:
            contentData.authorDepartment ?? user.department ?? undefined,
          targets: effectiveTargets ? { create: effectiveTargets } : undefined,
          categories: categoryIds
            ? {
                create: categoryIds.map((categoryId) => ({
                  categoryId,
                  createdBy: user.userId,
                })),
              }
            : undefined,
          // 紐づく型番 (REQ-009). 형번 쪽 유일성은 마스터가 보장하므로 중복 id 만 걷어낸다.
          productModels: productModelIds
            ? {
                create: [...new Set(productModelIds)].map((productModelId) => ({
                  productModelId,
                  createdBy: user.userId,
                })),
              }
            : undefined,
        },
        include: {
          targets: true,
          categories: { include: { category: CATEGORY_TREE_INCLUDE } },
          productModels: {
            include: { productModel: { include: { category: PRODUCT_MODEL_CATEGORY_SELECT } } },
            orderBy: [
              { productModel: { sortOrder: "asc" } },
              { productModel: { modelCode: "asc" } },
            ],
          },
        },
      });

      const result = await reconcileInlineImages({
        kind: "create",
        tx,
        contentId: created.id,
        body: contentData.body ?? null,
        user: { userType: user.userType, userId: user.userId },
      });

      return { content: created, unlinkPaths: result.unlinkPaths };
    });

    // 트랜잭션 commit 후 디스크 unlink (실패해도 응답에는 영향 없음).
    await unlinkInlineImages(unlinkPaths, "[POST /api/contents]");

    // POST 응답의 includeInternal은 요청자 역할에 따라 동적으로 판단.
    // 매트릭스가 외부 역할에 create 권한을 부여하더라도 내부 카테고리 노출을 방지.
    return NextResponse.json({
      data: {
        ...content,
        categories: buildCategoryTree(content.categories, { includeInternal: isInternalUser(user.role) }),
        // 링크 테이블 껍데기를 벗겨 형번 배열로 평탄화 (상세·수정 응답과 동일 형태)
        productModels: content.productModels.map((link) => link.productModel),
      },
    }, { status: 201 });
  } catch (error) {
    logError("POST /api/contents", error);
    return NextResponse.json(
      { error: "コンテンツの登録に失敗しました" },
      { status: 500 },
    );
  }
}
