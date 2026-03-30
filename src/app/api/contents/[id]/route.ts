import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import {
  canAccessContent,
  canModifyContent,
  getUserFromHeaders,
  isAdmin,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateContentSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

// GET /api/contents/:id — 콘텐츠 상세 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 접근제어를 위해 먼저 조회
    const existing = await prisma.content.findUnique({
      where: { id: parsed.data },
      include: { targets: { select: { targetType: true, startAt: true, endAt: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 게시대상/기간 접근제어
    if (!canAccessContent(user, existing.targets)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    const content = await prisma.content.update({
      where: { id: parsed.data },
      data: { viewCount: { increment: 1 } },
      include: {
        targets: { select: { id: true, targetType: true, startAt: true, endAt: true } },
        categories: {
          include: { category: { select: { id: true, name: true, categoryCode: true, isInternalOnly: true } } },
        },
        attachments: {
          select: { id: true, fileName: true, fileSize: true, mimeType: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const now = Date.now();

    return NextResponse.json({
      data: {
        ...content,
        isNew: now - content.createdAt.getTime() < FIVE_DAYS_MS,
        isUpdated: now - content.updatedAt.getTime() < FIVE_DAYS_MS,
        categories: content.categories.map((cc) => cc.category),
      },
    });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[GET /api/contents/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 },
    );
  }
}

// PUT /api/contents/:id — 콘텐츠 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);

    if (!user || !isAdmin(user.role)) {
      return NextResponse.json(
        { error: "관리자만 수정할 수 있습니다" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 권한 세분화: 슈퍼관리자=동일부문, 관리자=본인등록만
    const existing = await prisma.content.findUnique({
      where: { id: parsed.data },
      select: { userId: true, authorDepartment: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canModifyContent(user, existing)) {
      return NextResponse.json(
        { error: "수정 권한이 없습니다" },
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

    const result = updateContentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const { targets, categoryIds, ...contentData } = result.data;

    // targets replace (전달 시)
    if (targets) {
      await prisma.contentTarget.deleteMany({
        where: { contentId: parsed.data },
      });
    }

    // categoryIds replace (전달 시)
    if (categoryIds) {
      await prisma.contentCategory.deleteMany({
        where: { contentId: parsed.data },
      });
    }

    const content = await prisma.content.update({
      where: { id: parsed.data },
      data: {
        ...contentData,
        updatedBy: user.userId,
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
    });

    return NextResponse.json({ data: content });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PUT /api/contents/:id]", error);
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 },
    );
  }
}

// DELETE /api/contents/:id — 콘텐츠 삭제 (soft delete)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);

    if (!user || !isAdmin(user.role)) {
      return NextResponse.json(
        { error: "관리자만 삭제할 수 있습니다" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 권한 세분화: 슈퍼관리자=동일부문, 관리자=본인등록만
    const existing = await prisma.content.findUnique({
      where: { id: parsed.data },
      select: { userId: true, authorDepartment: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canModifyContent(user, existing)) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다" },
        { status: 403 },
      );
    }

    await prisma.content.update({
      where: { id: parsed.data },
      data: { status: "deleted", updatedBy: user.userId },
    });

    return NextResponse.json({
      data: { id: parsed.data, status: "deleted" },
    });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/contents/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete content" },
      { status: 500 },
    );
  }
}
