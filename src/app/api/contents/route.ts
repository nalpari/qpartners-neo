import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { AUTH_ROLE_TO_TARGET, getUserFromHeaders, isInternalUser, requireAdmin } from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { prisma } from "@/lib/prisma";
import { FIVE_DAYS_MS } from "@/lib/schemas/common";
import {
  createContentSchema,
  listContentsQuerySchema,
} from "@/lib/schemas/content";

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

    // 카테고리 필터 — 사용자가 지정한 categoryIds 로 some 매칭
    if (categoryIds) {
      andConditions.push({
        categories: {
          some: {
            categoryId: { in: categoryIds.split(",").map(Number).filter((n) => !isNaN(n)) },
          },
        },
      });
    }

    if (internal) {
      // 사내 사용자:
      // - internalOnly=true → 외부 게시대상이 없는(사내회원 전용) 게시글만
      //   (internalOnly 체크 시 targetType 파라미터는 무시 — UI 에서도 disabled)
      // - internalOnly=false && targetType 지정 → 해당 targetType 필터
      // - 둘 다 미지정 → 전체 열람
      if (internalOnly) {
        andConditions.push({ targets: { none: {} } });
      } else if (targetType) {
        andConditions.push({ targets: { some: { targetType } } });
      }
    } else {
      // 비사내 사용자:
      // - 사내전용 카테고리 제외 (internalOnly 파라미터와 무관하게 강제 — 이전 bypass 차단)
      // - 역할 기반으로 targetType 서버 강제 (쿼리 파라미터 무시)
      andConditions.push({
        categories: { none: { category: { isInternalOnly: true } } },
      });
      andConditions.push({
        targets: {
          some: {
            targetType: user ? (AUTH_ROLE_TO_TARGET[user.role] ?? "non_member") : "non_member",
            AND: [
              { OR: [{ startAt: null }, { startAt: { lte: new Date() } }] },
              { OR: [{ endAt: null }, { endAt: { gte: new Date() } }] },
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

    const now = Date.now();
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
      isNew: now - c.createdAt.getTime() < FIVE_DAYS_MS,
      isUpdated: now - c.updatedAt.getTime() < FIVE_DAYS_MS,
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
    const auth = requireAdmin(request.headers);
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

    // POST는 requireAdmin 통과자 = 사내 사용자이므로 includeInternal=true (PUT detail과 동일 정책)
    return NextResponse.json({
      data: {
        ...content,
        categories: buildCategoryTree(content.categories, { includeInternal: true }),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contents] 콘텐츠 등록 실패:", error);
    return NextResponse.json(
      { error: "コンテンツの登録に失敗しました" },
      { status: 500 },
    );
  }
}
