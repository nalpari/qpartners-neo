import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

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
import { FIVE_DAYS_MS } from "@/lib/schemas/common";
import { targetOrderRank } from "@/lib/target-role-order";
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
    let categoryEmpty = false;
    if (categoryIds) {
      const parsedIds = categoryIds
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      if (parsedIds.length > 0) {
        const ccRows = await prisma.contentCategory.findMany({
          where: { categoryId: { in: parsedIds } },
          select: { contentId: true },
          distinct: ["contentId"],
        });
        const filteredContentIds = ccRows.map((r) => r.contentId);
        if (filteredContentIds.length === 0) {
          // 매핑된 콘텐츠가 없음 → fast-path 0 응답
          categoryEmpty = true;
        } else {
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

    let data: ReturnType<typeof mapRow>[];
    let total: number;

    // "값 없음"(null)을 정렬 방향과 무관하게 항상 뒤로 보내는 비교자 — 카테고리 미매칭 콘텐츠(문자열 키),
    // 미수정 콘텐츠(updatedAt 숫자 키), 게시대상 없는 콘텐츠(targetOrderRank 숫자 키) 세 곳에서 재사용.
    const compareNullsLast = <K extends string | number>(
      a: K | null,
      b: K | null,
      dir: "asc" | "desc",
    ): number => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      // typeof 가드로 판별 — 향후 새 정렬 키 타입 추가 시 타입 혼재를 캐스팅 없이 런타임에서도 잡는다.
      let cmp: number;
      if (typeof a === "string" && typeof b === "string") {
        cmp = a.localeCompare(b, "ja");
      } else if (typeof a === "number" && typeof b === "number") {
        cmp = a - b;
      } else {
        console.error("[GET /api/contents] compareNullsLast 타입 불일치:", { a, b });
        cmp = 0;
      }
      return dir === "asc" ? cmp : -cmp;
    };

    // DB orderBy 로 표현 불가한 정렬(다대다 집계, "실제 수정 여부" 판별)은 전체 로우를 가져와
    // JS 에서 키를 계산해 정렬 후 페이지를 자른다 — 콘텐츠 총량이 적어(수백 건 내외) 무시 가능한 비용.
    // 세 케이스는 Zod superRefine(listContentsQuerySchema)이 동시 지정을 막아 항상 하나만 채워진다
    // — 아래 삼항연산자 순서(카테고리 > 更新日 > 掲示対象)는 그 보장 위에서의 평가 순서일 뿐 우선순위 의미는 없다.
    const inMemorySortKey: ((row: ReturnType<typeof mapRow>) => string | number | null) | null = sortCategoryCode
      ? (row) => row.categories.find((cat) => cat.categoryCode === sortCategoryCode)?.children[0]?.name ?? null
      : sortField === "updatedAt"
      ? (row) => (row.hasBeenUpdated ? row.updatedAt.getTime() : null)
      : sortTargets
      ? (row) => (row.targets.length === 0 ? null : Math.min(...row.targets.map((t) => targetOrderRank(t.roleCode))))
      : null;

    if (inMemorySortKey) {
      // DB 조회 실패를 mapRow/sort 등 이후 단계와 분리해 로그에서 원인을 구분할 수 있게 한다
      // (최상위 catch 하나로 묶이면 "인메모리 정렬 중 DB 조회 실패"인지 다른 단계인지 알 수 없다).
      let allRows;
      try {
        allRows = await prisma.content.findMany({
          where,
          include: includeOptions,
          orderBy: { createdAt: "desc" },
        });
      } catch (dbError: unknown) {
        logError("GET /api/contents inMemorySort DB조회", dbError, {
          sortCategoryCode,
          sortField,
          sortTargets,
        });
        return NextResponse.json({ error: "コンテンツの取得に失敗しました" }, { status: 500 });
      }
      const dir = sortDir ?? "asc";
      const withSortKey = allRows.map((c) => {
        const row = mapRow(c);
        return { row, key: inMemorySortKey(row) };
      });
      // 유효하지 않은 sortCategoryCode(존재하지 않는 카테고리 코드) 는 모든 행이 null 키로
      // 떨어져 "정렬이 안 되는 것처럼" 보이는데 로그가 없으면 원인 파악이 어렵다.
      if (sortCategoryCode && withSortKey.length > 0 && withSortKey.every((x) => x.key === null)) {
        console.warn(
          "[GET /api/contents] sortCategoryCode 매칭 결과 없음 — 존재하지 않는 카테고리 코드일 수 있음:",
          sortCategoryCode,
        );
      }
      withSortKey.sort((a, b) => compareNullsLast(a.key, b.key, dir));
      total = withSortKey.length;
      data = withSortKey.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize).map((x) => x.row);
    } else {
      // ag-grid 헤더 클릭 정렬 — sortField 지정 시 프리셋(sort)보다 우선.
      // 이 분기(else)에 도달했다는 것 자체가 inMemorySortKey 가 null 이었다는 뜻이므로
      // sortField==="updatedAt" 는 inMemorySortKey 를 채우므로 이 else 분기에 도달하지 않는다
      // — 아래 case "updatedAt" 은 sortField switch 의 exhaustiveness(컴파일 타임 never 검증)를
      // 위해 존재하는 도달 불가 분기.
      const orderBy: Prisma.ContentOrderByWithRelationInput = (() => {
        if (sortField) {
          const dir = sortDir ?? "asc";
          switch (sortField) {
            case "title":
              return { title: dir };
            case "createdAt":
              return { createdAt: dir };
            case "updatedAt":
              return { updatedAt: dir };
            case "authorDepartment":
              return { authorDepartment: dir };
            case "approverLevel":
              return { approverLevel: dir };
            case "attachmentCount":
              return { attachments: { _count: dir } };
            case "viewCount":
              return { viewCount: dir };
            default: {
              // CONTENT_SORT_FIELDS 에 필드를 추가했는데 case 를 빠뜨리면 이 줄에서 컴파일 에러가
              // 나서 알아챌 수 있다 — case 누락이 컴파일 통과 후 조용히 기본 정렬로 fallback 되는 것 방지.
              const _exhaustive: never = sortField;
              console.error("[GET /api/contents] 처리되지 않은 sortField:", _exhaustive);
              return { createdAt: "desc" as const };
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

      let dbResult;
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
