import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { prisma } from "@/lib/prisma";
import { createMenuSchema } from "@/lib/schemas/menu";

// GET /api/menus — 메뉴 트리 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const menus = await prisma.menu.findMany({
      where: {
        parentId: null,
        ...(activeOnly && { isActive: true }),
      },
      include: {
        children: {
          where: {
            ...(activeOnly && { isActive: true }),
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: menus });
  } catch (error) {
    console.error("[GET /api/menus]", error);
    return NextResponse.json(
      { error: "Failed to fetch menus" },
      { status: 500 },
    );
  }
}

// POST /api/menus — 메뉴 등록
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 2레벨 제한: parent의 parentId가 not null이면 3레벨 → 거부
    if (result.data.parentId !== null) {
      const parent = await prisma.menu.findUnique({
        where: { id: result.data.parentId },
        select: { parentId: true },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "상위 메뉴가 존재하지 않습니다" },
          { status: 404 },
        );
      }

      if (parent.parentId !== null) {
        return NextResponse.json(
          { error: "2레벨까지만 등록 가능합니다" },
          { status: 400 },
        );
      }
    }

    const menu = await prisma.menu.create({ data: result.data });
    return NextResponse.json({ data: menu }, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 존재하는 menuCode입니다" },
        { status: 409 },
      );
    }
    console.error("[POST /api/menus]", error);
    return NextResponse.json(
      { error: "Failed to create menu" },
      { status: 500 },
    );
  }
}
