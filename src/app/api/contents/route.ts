import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { AUTH_ROLE_TO_TARGET, getUserFromHeaders, isInternalUser, requireMenuPermission } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { FIVE_DAYS_MS, targetTypeValues } from "@/lib/schemas/common";
import {
  createContentSchema,
  listContentsQuerySchema,
} from "@/lib/schemas/content";

/**
 * 외부 게시대상 타입 목록 — "사내회원 전용 게시글" 필터의 의미론적 기반.
 * 현재 정의된 targetTypeValues 는 모두 외부(판매점/시공점/일반/비회원) 라
 * `none: {}` 과 기능적으로 동일하지만, 향후 internal 타입 추가 시에도 규약을
 * 화이트리스트로 강제하기 위해 명시적 상수를 둠.
 */
const EXTERNAL_TARGET_TYPES = targetTypeValues;

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
      targetType,
      department,
      internalOnly,
      sort,
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

    if (internal) {
      // 사내 사용자 (관리 목적):
      // - internalOnly=true → 외부 타겟이 하나도 없는(사내회원 전용) 게시글만
      //   · targets.none 에 외부 타입 화이트리스트를 명시해 의미론 강제 (향후 internal 타입 추가 대비)
      //   · internalOnly 체크 시 targetType 파라미터는 무시 — UI 에서도 disabled
      // - internalOnly=false && targetType 지정 → 해당 targetType 필터
      // - 둘 다 미지정 → 전체 열람
      //
      // 정책 주석: 사내 분기는 publication window(startAt/endAt) 를 의도적으로 미적용.
      //           예정/만료 게시글을 관리자 패널에서 함께 점검할 수 있게 함.
      if (internalOnly) {
        andConditions.push({
          targets: { none: { targetType: { in: [...EXTERNAL_TARGET_TYPES] } } },
        });
      } else if (targetType) {
        andConditions.push({ targets: { some: { targetType } } });
      }
    } else {
      // 비사내 사용자:
      // - 노출 결정은 게시대상(ContentTarget) 만으로 한다 (운영 정책 갱신).
      //   카테고리는 분류 라벨일 뿐 노출 차단 기준이 아니며, 사내 전용 카테고리 라벨은
      //   응답 시점의 buildCategoryTree({ includeInternal: false }) 가 자동 제외한다.
      //   → 콘텐츠 자체는 게시대상 매칭 시 노출되되 사내 전용 카테고리 라벨만 숨김.
      // - 역할 기반으로 targetType 서버 강제 (쿼리 파라미터 무시)
      // - publication window 엄격 적용
      andConditions.push({
        targets: {
          some: {
            targetType: user ? (AUTH_ROLE_TO_TARGET[user.role] ?? "non_member") : "non_member",
            AND: [
              { OR: [{ startAt: null }, { startAt: { lte: now } }] },
              { OR: [{ endAt: null }, { endAt: { gte: now } }] },
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
      ...(department && { authorDepartment: department }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const orderBy: Prisma.ContentOrderByWithRelationInput = (() => {
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

    const [contents, total] = await Promise.all([
      prisma.content.findMany({
        where,
        include: {
          categories: {
            include: { category: CATEGORY_TREE_INCLUDE },
          },
          targets: { select: { targetType: true, startAt: true, endAt: true } },
          _count: { select: { attachments: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.content.count({ where }),
    ]);

    // isNew/isUpdated 계산용 — where 절의 now 와 동일 스냅샷 사용 (정책 일관성)
    const nowMs = now.getTime();
    const data = contents.map((c) => ({
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
    }));

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
    console.error("[GET /api/contents]", error);
    return NextResponse.json(
      { error: "Failed to fetch contents" },
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

    // 보조 가드 — CONTENT.canCreate 매트릭스와 별개로 비사내 역할은 등록 불가.
    // (SUPER_ADMIN 이 매트릭스 실수 토글로 GENERAL/SEKO/STORE 에 create 를 부여해도
    //  `includeInternal=true` 응답·내부 카테고리 노출이 발생하지 않도록 두 번째 방어선.)
    if (!isInternalUser(user.role)) {
      console.warn(
        `[POST /api/contents] 비사내 역할 create 시도 차단 — role=${user.role}`,
      );
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 },
      );
    }

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

    // publishedAt 자동 설정
    const publishedAt =
      contentData.status === "published"
        ? (contentData.publishedAt ?? new Date())
        : undefined;

    const content = await prisma.content.create({
      data: {
        ...contentData,
        publishedAt,
        userType: user.userType,
        userId: user.userId,
        createdBy: user.userId,
        authorDepartment:
          contentData.authorDepartment ?? user.department ?? undefined,
        targets: targets
          ? { create: targets }
          : undefined,
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
        // GET/PUT과 동일하게 트리 구조 응답을 위해 CATEGORY_TREE_INCLUDE 사용
        categories: { include: { category: CATEGORY_TREE_INCLUDE } },
      },
    });

    // POST는 requireMenuPermission("CONTENT","create") 통과자 = 사내 사용자이므로
    // includeInternal=true (PUT detail과 동일 정책)
    return NextResponse.json({
      data: {
        ...content,
        categories: buildCategoryTree(content.categories, { includeInternal: true }),
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
