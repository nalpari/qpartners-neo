import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isInternalUser, requireMenuPermission } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { ensureAuthorTarget } from "@/lib/contents-author-target";
import { jstDayStart, jstNextDayStart } from "@/lib/jst-day";
import {
  reconcileInlineImages,
  unlinkInlineImages,
} from "@/lib/inline-image-cleanup";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { FIVE_DAYS_MS } from "@/lib/schemas/common";
import {
  createContentSchema,
  listContentsQuerySchema,
} from "@/lib/schemas/content";

/**
 * 사내 권한 코드 — internalOnly 필터의 의미론적 기반.
 * isInternalUser(auth.ts) 와 동일한 판정 기준(SUPER_ADMIN/ADMIN)을 하드코딩.
 * 사내 사용자는 canAccessContent fail-open 으로 모든 콘텐츠 접근 가능하므로
 * ContentTarget 에 사내 행이 등록될 일은 거의 없지만, 명시적 화이트리스트로
 * "외부 게시대상이 0건" 인 콘텐츠 = 사내 전용 의미를 강제한다.
 *
 * 주의: 신규 사내 권한(예: IT_ADMIN)을 추가할 경우 isInternalUser 와 함께 이 배열도
 * 업데이트해야 한다. DB 동적 조회 도입은 Phase 5 에서 평가.
 */
const INTERNAL_ROLE_CODES = ["SUPER_ADMIN", "ADMIN"] as const;

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
      categoryIds,
      status,
      roleCode,
      department,
      internalOnly,
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

    // 카테고리 필터 — 멀티 선택 시 한 콘텐츠가 여러 categoryId 와 매핑되어 있으면
    // `categories: { some: { categoryId: { in: [...] } } }` 가 SQL JOIN 으로 컴파일되며
    // count/findMany 모두 매핑 행 수만큼 콘텐츠가 중복 카운트되는 현상이 관측됨
    // (예: 営業 단일 0건, 技術 단일 1건인데 멀티 선택 시 2건).
    //
    // 따라서 `ContentCategory` 에서 `distinct contentId` 를 먼저 조회해 `id IN [...]` 로
    // 변환한다. 이렇게 하면 count/findMany 모두 콘텐츠 단위로 정확히 집계된다.
    // 추가 쿼리 1회 비용은 contentId 만 select 하므로 가볍다.
    //
    // Number("")==0, !isNaN(0)==true 로 0 이 통과되는 것을 막기 위해 양의 정수만 허용.
    // Number.isInteger 는 NaN/Infinity 도 제외하므로 isFinite 중복 불필요.
    // sortCategoryCode 단일 SQL 분기에서 재사용하므로 스코프 밖으로 호이스트
    let filteredContentIds: number[] | null = null;
    let categoryEmpty = false;
    if (categoryIds) {
      const parsedIds = categoryIds
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      if (parsedIds.length > 0) {
        let ccRows: { contentId: number }[];
        try {
          ccRows = await prisma.contentCategory.findMany({
            where: { categoryId: { in: parsedIds } },
            select: { contentId: true },
            distinct: ["contentId"],
          });
        } catch (dbError: unknown) {
          logError("GET /api/contents categoryIds 필터조회", dbError, { parsedIds });
          return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
        }
        const ids = ccRows.map((r) => r.contentId);
        if (ids.length === 0) {
          // 매핑된 콘텐츠가 없음 → fast-path 0 응답
          categoryEmpty = true;
        } else {
          filteredContentIds = ids;
          andConditions.push({ id: { in: filteredContentIds } });
        }
      }
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

    // 게시기간 date-only 비교용 — JST 기준 오늘/내일 자정.
    // startAt 이 오늘 중 어떤 시각이든 통과시키려면 `< tomorrowStart` 비교 (Redmine #2131).
    const todayStart = jstDayStart(now);
    const tomorrowStart = jstNextDayStart(now);

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
      andConditions.push({
        targets: {
          some: {
            roleCode: user ? user.role : null,
            AND: [
              // 노출기간 day 단위 비교 — startAt 이 오늘 어떤 시각이든 통과 (< tomorrowStart).
              // endAt 이 오늘 자정 이상이면 오늘 종일 노출 (Redmine #2131).
              { OR: [{ startAt: null }, { startAt: { lt: tomorrowStart } }] },
              { OR: [{ endAt: null }, { endAt: { gte: todayStart } }] },
            ],
          },
        },
      });
    }

    const where: Prisma.ContentWhereInput = {
      status: effectiveStatus as "draft" | "published" | "deleted",
      ...(keyword && {
        OR: [
          { title: { contains: keyword } },
          { body: { contains: keyword } },
        ],
      }),
      ...(department && department.length > 0 && { authorDepartment: { in: department } }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const includeOptions = {
      categories: {
        include: { category: CATEGORY_TREE_INCLUDE },
      },
      targets: { select: { roleCode: true, startAt: true, endAt: true } },
      _count: { select: { attachments: true } },
    } as const;

    // isNew/isUpdated 계산용 — where 절의 now 와 동일 스냅샷 사용 (정책 일관성)
    const nowMs = now.getTime();
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
      isNew: nowMs - c.createdAt.getTime() < FIVE_DAYS_MS,
      isUpdated: nowMs - c.updatedAt.getTime() < FIVE_DAYS_MS,
      categories: buildCategoryTree(c.categories, { includeInternal: internal }),
      targets: c.targets,
      attachmentCount: c._count.attachments,
    });

    let data: ReturnType<typeof mapRow>[] = [];
    let total = 0;

    if (sortCategoryCode) {
      // DB 정렬: 카테고리 자식명 기준.
      // 전체 ID materialization 없이 WHERE + 정렬 + 페이지네이션 + COUNT를 단일 SQL로 처리.
      // children[0] 은 sortOrder ASC → id ASC 기준 (buildCategoryTree 및 클라이언트 getFirstCategoryChildName 과 동일).

      // 비사내 공개 경로 rate limit — DB 부하 방지 (IP당 60회/분, IP 불명 시 20회/분)
      if (!internal) {
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          request.headers.get("x-real-ip") ??
          null;
        const rlKey = ip
          ? `contents-sort:${ip}`
          : `contents-sort:user:${user?.userId ?? "anon"}`;
        const rlLimit = ip ? 60 : 20;
        if (!checkRateLimit(rlKey, rlLimit, 60_000)) {
          return NextResponse.json(
            { error: "リクエストが多すぎます。しばらくしてから再試行してください。" },
            { status: 429 },
          );
        }
      }

      // WHERE 조건을 SQL fragment로 직접 구성 — Prisma WHERE와 동일한 필터 로직
      const sqlConds: Prisma.Sql[] = [
        Prisma.sql`c.status = ${effectiveStatus}`,
      ];

      if (keyword) {
        const kw = `%${keyword}%`;
        sqlConds.push(Prisma.sql`(c.title LIKE ${kw} OR c.body LIKE ${kw})`);
      }

      if (department && department.length > 0) {
        sqlConds.push(Prisma.sql`c.author_department IN (${Prisma.join(department)})`);
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
        // 비사내: 세션 역할 기반 게시대상 + 게시기간 필터 (Prisma WHERE와 동일)
        const userRole = user?.role ?? null;
        if (userRole === null) {
          sqlConds.push(Prisma.sql`EXISTS (
            SELECT 1 FROM qp_content_targets ct
            WHERE ct.content_id = c.id
              AND ct.role_code IS NULL
              AND (ct.start_at IS NULL OR ct.start_at < ${tomorrowStart})
              AND (ct.end_at IS NULL OR ct.end_at >= ${todayStart})
          )`);
        } else {
          sqlConds.push(Prisma.sql`EXISTS (
            SELECT 1 FROM qp_content_targets ct
            WHERE ct.content_id = c.id
              AND ct.role_code = ${userRole}
              AND (ct.start_at IS NULL OR ct.start_at < ${tomorrowStart})
              AND (ct.end_at IS NULL OR ct.end_at >= ${todayStart})
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

    return NextResponse.json({
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
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

    const { targets, categoryIds, ...contentData } = result.data;

    // 비사내 작성자의 본인 권한 강제 포함 — FE 우회 방어 (정책: lib/contents-author-target.ts).
    const effectiveTargets = ensureAuthorTarget(targets, user.role);

    // publishedAt 자동 설정
    const publishedAt =
      contentData.status === "published"
        ? (contentData.publishedAt ?? new Date())
        : undefined;

    // 본문 임베드 이미지 cleanup 을 같은 트랜잭션 안에서 수행 — 콘텐츠 INSERT 가 롤백되면
    // stamp/delete 도 자동 원복. 디스크 unlink 는 commit 후 별도 처리(실패해도 정합성 영향 없음).
    const { content, unlinkPaths } = await prisma.$transaction(async (tx) => {
      const created = await tx.content.create({
        data: {
          ...contentData,
          publishedAt,
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
        },
        include: {
          targets: true,
          categories: { include: { category: CATEGORY_TREE_INCLUDE } },
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
