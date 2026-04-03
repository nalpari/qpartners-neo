import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import {
  canAccessContent,
  canModifyContent,
  getUserFromHeaders,
  isInternalUser,
  requireAdmin,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FIVE_DAYS_MS } from "@/lib/schemas/common";
import { idParamSchema, updateContentSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

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

    // 삭제된 콘텐츠는 사내 사용자만 조회 가능
    const internal = user ? isInternalUser(user.role) : false;
    if (existing.status === "deleted" && !internal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 게시대상/기간 접근제어
    if (!canAccessContent(user, existing.targets)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    // viewCount 증가: published 상태이고 사내 사용자가 아닌 경우만 (봇/프리패치 방어)
    const shouldIncrement =
      existing.status === "published" && !internal;

    const content = await prisma.content.update({
      where: { id: parsed.data },
      data: shouldIncrement ? { viewCount: { increment: 1 } } : {},
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
        attachments: content.attachments.map((a) => ({
          ...a,
          fileSize: a.fileSize !== null ? Number(a.fileSize) : null,
        })),
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
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

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

    // interactive transaction으로 원자적 처리
    const content = await prisma.$transaction(async (tx) => {
      if (targets) {
        await tx.contentTarget.deleteMany({
          where: { contentId: parsed.data },
        });
      }

      if (categoryIds) {
        await tx.contentCategory.deleteMany({
          where: { contentId: parsed.data },
        });
      }

      return tx.content.update({
        where: { id: parsed.data },
        data: {
          ...contentData,
          updatedBy: user.userId,
          targets: targets ? { create: targets } : undefined,
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
          targets: { select: { id: true, targetType: true, startAt: true, endAt: true } },
          categories: { include: { category: { select: { id: true, name: true, categoryCode: true, isInternalOnly: true } } } },
        },
      });
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
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

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
