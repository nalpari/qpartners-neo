import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCategorySchema } from "@/lib/schemas/category";

type Params = { params: Promise<{ id: string }> };

// PUT /api/categories/:id — 카테고리 수정 (categoryCode, parentId 수정 불가)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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

    const result = updateCategorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    let reorderLog: {
      categoryId: number;
      parentId: number | null;
      oldOrder: number;
      newOrder: number;
      direction: "up" | "down";
      shiftedCount: number;
    } | null = null;

    const category = await prisma.$transaction(
      async (tx) => {
        // sortOrder가 명시적으로 전달된 경우에만 같은 parentId 형제들 자동 재정렬
        // NOTE: parentId는 updateCategorySchema에서 수정 불가. 변경 시 이 로직도 수정 필요
        if (result.data.sortOrder !== undefined) {
          const current = await tx.category.findUnique({
            where: { id: parsed.data },
            select: { parentId: true, sortOrder: true },
          });

          if (!current) {
            throw new Error("NOT_FOUND");
          }

          const newOrder = result.data.sortOrder;
          if (newOrder < current.sortOrder) {
            // 위로 이동: [newOrder, oldOrder) 범위 형제 +1
            const shifted = await tx.category.updateMany({
              where: {
                parentId: current.parentId,
                id: { not: parsed.data },
                sortOrder: { gte: newOrder, lt: current.sortOrder },
              },
              data: { sortOrder: { increment: 1 } },
            });
            reorderLog = {
              categoryId: parsed.data,
              parentId: current.parentId,
              oldOrder: current.sortOrder,
              newOrder,
              direction: "up",
              shiftedCount: shifted.count,
            };
          } else if (newOrder > current.sortOrder) {
            // 아래로 이동: (oldOrder, newOrder] 범위 형제 -1
            const shifted = await tx.category.updateMany({
              where: {
                parentId: current.parentId,
                id: { not: parsed.data },
                sortOrder: { gt: current.sortOrder, lte: newOrder },
              },
              data: { sortOrder: { decrement: 1 } },
            });
            reorderLog = {
              categoryId: parsed.data,
              parentId: current.parentId,
              oldOrder: current.sortOrder,
              newOrder,
              direction: "down",
              shiftedCount: shifted.count,
            };
          }
          // newOrder === current.sortOrder: 형제 재정렬 불필요
        }

        return tx.category.update({
          where: { id: parsed.data },
          data: result.data,
        });
      },
      { isolationLevel: "Serializable" },
    );

    if (reorderLog) {
      console.log("[PUT /api/categories/:id] sortOrder 재정렬", reorderLog);
    }

    return NextResponse.json({ data: category });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PUT /api/categories/:id]", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 },
    );
  }
}

// DELETE /api/categories/:id — 카테고리 삭제 (물리 삭제)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 하위 카테고리 존재 여부만 확인 후 삭제. 콘텐츠 연결(ContentCategory)은
    // Prisma 스키마의 onDelete: Cascade 로 자동 정리됨 (콘텐츠 본체는 영향 없음, 링크만 제거).
    const deleted = await prisma.$transaction(async (tx) => {
      const childCount = await tx.category.count({
        where: { parentId: parsed.data },
      });

      if (childCount > 0) {
        throw new Error("HAS_CHILDREN");
      }

      await tx.category.delete({ where: { id: parsed.data } });
      return { id: parsed.data };
    });

    return NextResponse.json({ data: deleted });
  } catch (error) {
    if (error instanceof Error && error.message === "HAS_CHILDREN") {
      return NextResponse.json(
        { error: "하위 카테고리가 존재하여 삭제할 수 없습니다" },
        { status: 400 },
      );
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/categories/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 },
    );
  }
}
