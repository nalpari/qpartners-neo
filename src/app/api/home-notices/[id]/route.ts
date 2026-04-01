import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  idParamSchema,
  updateHomeNoticeSchema,
} from "@/lib/schemas/home-notice";

type Params = { params: Promise<{ id: string }> };

// PUT /api/home-notices/:id — 공지 수정
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

    const result = updateHomeNoticeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // startAt 또는 endAt 한쪽만 보낸 경우, 기존 레코드와 cross-validation
    if (result.data.startAt || result.data.endAt) {
      const existing = await prisma.homeNotice.findUnique({
        where: { id: parsed.data },
        select: { startAt: true, endAt: true },
      });

      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const finalStartAt = result.data.startAt ?? existing.startAt;
      const finalEndAt = result.data.endAt ?? existing.endAt;

      if (finalStartAt >= finalEndAt) {
        return NextResponse.json(
          { error: "시작일은 종료일보다 이전이어야 합니다" },
          { status: 400 },
        );
      }
    }

    const notice = await prisma.homeNotice.update({
      where: { id: parsed.data },
      data: { ...result.data, updatedBy: auth.user.userId },
    });

    return NextResponse.json({ data: notice });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PUT /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "Failed to update home notice" },
      { status: 500 },
    );
  }
}

// DELETE /api/home-notices/:id — 공지 삭제 (물리 삭제)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await prisma.homeNotice.delete({ where: { id: parsed.data } });

    return NextResponse.json({ data: { id: parsed.data } });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete home notice" },
      { status: 500 },
    );
  }
}
