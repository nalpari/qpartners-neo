import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCategorySchema } from "@/lib/schemas/category";

// GET /api/categories — 카테고리 트리 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const internalOnly = searchParams.get("internalOnly") === "true";
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const categories = await prisma.category.findMany({
      where: {
        parentId: null,
        ...(activeOnly && { isActive: true }),
        ...(internalOnly && { isInternalOnly: true }),
      },
      include: {
        children: {
          where: {
            ...(activeOnly && { isActive: true }),
            ...(internalOnly && { isInternalOnly: true }),
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error("[GET /api/categories]", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

// POST /api/categories — 카테고리 등록
export async function POST(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createCategorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 2Depth 제한: parent의 parentId가 not null이면 3Depth → 거부
    if (result.data.parentId !== null) {
      const parent = await prisma.category.findUnique({
        where: { id: result.data.parentId },
        select: { parentId: true },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "상위 카테고리가 존재하지 않습니다" },
          { status: 404 },
        );
      }

      if (parent.parentId !== null) {
        return NextResponse.json(
          { error: "2Depth까지만 등록 가능합니다" },
          { status: 400 },
        );
      }
    }

    const category = await prisma.category.create({ data: result.data });
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 존재하는 categoryCode입니다" },
        { status: 409 },
      );
    }
    console.error("[POST /api/categories]", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
}
