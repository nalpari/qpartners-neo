import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateMenuSchema } from "@/lib/schemas/menu";

type Params = { params: Promise<{ id: string }> };

// PUT /api/menus/:id — 메뉴 수정 (ADM_MENU.update — SUPER_ADMIN 전용, ADMIN 은 403)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_MENU", "update");
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

    const result = updateMenuSchema.safeParse(body);

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

    const menu = await prisma.menu.update({
      where: { id: parsed.data },
      data: result.data,
    });

    return NextResponse.json({ data: menu });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PUT /api/menus/:id]", error);
    return NextResponse.json(
      { error: "Failed to update menu" },
      { status: 500 },
    );
  }
}
