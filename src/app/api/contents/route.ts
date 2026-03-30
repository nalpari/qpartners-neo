import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { getUserFromHeaders, isAdmin, isInternalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createContentSchema,
  listContentsQuerySchema,
} from "@/lib/schemas/content";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

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

    // 비회원/일반회원은 published만
    const effectiveStatus =
      !internal && status !== "published" ? "published" : status;

    const where: Prisma.ContentWhereInput = {
      status: effectiveStatus as "draft" | "published" | "deleted",
      ...(keyword && {
        OR: [
          { title: { contains: keyword } },
          { body: { contains: keyword } },
        ],
      }),
      ...(department && { authorDepartment: department }),
      ...(categoryIds && {
        categories: {
          some: {
            categoryId: {
              in: categoryIds.split(",").map(Number),
            },
          },
        },
      }),
      // 사내전용 카테고리 필터: 비사내 사용자는 사내전용 카테고리 콘텐츠 제외
      ...(!internal &&
        internalOnly === false && {
          categories: {
            none: {
              category: { isInternalOnly: true },
            },
          },
        }),
      // 게시대상 필터: 비사내 사용자는 자기 targetType에 해당하는 것만
      ...(!internal && {
        targets: {
          some: {
            targetType: (targetType ??
              user?.role ??
              "non_member") as
              | "first_dealer"
              | "second_dealer"
              | "constructor"
              | "general"
              | "non_member",
            OR: [
              { startAt: null },
              {
                startAt: { lte: new Date() },
                endAt: { gte: new Date() },
              },
            ],
          },
        },
      }),
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
            include: { category: { select: { id: true, name: true, categoryCode: true, isInternalOnly: true } } },
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
      viewCount: c.viewCount,
      publishedAt: c.publishedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      isNew: now - c.createdAt.getTime() < FIVE_DAYS_MS,
      isUpdated: now - c.updatedAt.getTime() < FIVE_DAYS_MS,
      categories: c.categories.map((cc) => cc.category),
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
    const user = getUserFromHeaders(request.headers);

    if (!user || !isAdmin(user.role)) {
      return NextResponse.json(
        { error: "관리자만 등록할 수 있습니다" },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
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
        categories: { include: { category: true } },
      },
    });

    return NextResponse.json({ data: content }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contents]", error);
    return NextResponse.json(
      { error: "Failed to create content" },
      { status: 500 },
    );
  }
}
