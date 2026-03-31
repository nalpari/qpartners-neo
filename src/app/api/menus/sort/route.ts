import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sortMenuSchema } from "@/lib/schemas/menu";

// PUT /api/menus/sort — 정렬순서 일괄 저장
export async function PUT(request: NextRequest) {
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

    const result = sortMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 트랜잭션으로 일괄 업데이트
    await prisma.$transaction(
      result.data.items.map((item) =>
        prisma.menu.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return NextResponse.json({ data: { updated: result.data.items.length } });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "존재하지 않는 메뉴가 포함되어 있습니다" },
        { status: 404 },
      );
    }
    console.error("[PUT /api/menus/sort]", error);
    return NextResponse.json(
      { error: "Failed to update sort order" },
      { status: 500 },
    );
  }
}
