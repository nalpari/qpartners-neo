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

    const category = await prisma.category.update({
      where: { id: parsed.data },
      data: result.data,
    });

    return NextResponse.json({ data: category });
  } catch (error) {
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

    // 하위 카테고리/콘텐츠 존재 확인 + 삭제를 트랜잭션으로 원자적 처리
    const deleted = await prisma.$transaction(async (tx) => {
      const childCount = await tx.category.count({
        where: { parentId: parsed.data },
      });

      if (childCount > 0) {
        throw new Error("HAS_CHILDREN");
      }

      const contentCount = await tx.contentCategory.count({
        where: { categoryId: parsed.data },
      });

      if (contentCount > 0) {
        throw new Error("HAS_CONTENTS");
      }

      await tx.category.delete({ where: { id: parsed.data } });
      return { id: parsed.data };
    });

    return NextResponse.json({ data: deleted });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "HAS_CHILDREN") {
        return NextResponse.json(
          { error: "하위 카테고리가 존재하여 삭제할 수 없습니다" },
          { status: 400 },
        );
      }
      if (error.message === "HAS_CONTENTS") {
        return NextResponse.json(
          { error: "연결된 콘텐츠가 존재하여 삭제할 수 없습니다" },
          { status: 400 },
        );
      }
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
