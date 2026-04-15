import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  idParamSchema,
  updateHomeNoticeSchema,
  computeStatus,
  toTargetArray,
} from "@/lib/schemas/home-notice";

type Params = { params: Promise<{ id: string }> };

// GET /api/home-notices/:id — 공지 단건 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    const notice = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
    });

    if (!notice) {
      return NextResponse.json(
        { error: "お知らせが見つかりません" },
        { status: 404 },
      );
    }

    const data = {
      id: notice.id,
      targets: toTargetArray(notice),
      content: notice.content,
      url: notice.url,
      startAt: notice.startAt,
      endAt: notice.endAt,
      status: computeStatus(notice.startAt, notice.endAt),
      userType: notice.userType,
      userId: notice.userId,
      createdAt: notice.createdAt,
      createdBy: notice.createdBy,
      updatedAt: notice.updatedAt,
      updatedBy: notice.updatedBy,
    };

    console.log(`[GET /api/home-notices/:id] 공지 단건 조회 — id: ${notice.id}`);

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error("[GET /api/home-notices/:id] 공지 단건 조회 실패:", error);
    return NextResponse.json(
      { error: "お知らせの取得に失敗しました" },
      { status: 500 },
    );
  }
}

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
    const existing = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
      select: { startAt: true, endAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }

    const finalStartAt = result.data.startAt ?? existing.startAt;
    const finalEndAt = result.data.endAt ?? existing.endAt;

    if (finalStartAt >= finalEndAt) {
      return NextResponse.json(
        { error: "開始日は終了日より前に設定してください" },
        { status: 400 },
      );
    }

    // 게시기간 겹치는 공지 5개 초과 체크 + 수정을 트랜잭션으로 처리
    const notice = await prisma.$transaction(
      async (tx) => {
        const overlapCount = await tx.homeNotice.count({
          where: {
            id: { not: parsed.data },
            startAt: { lte: finalEndAt },
            endAt: { gte: finalStartAt },
          },
        });

        if (overlapCount >= 5) {
          throw new Error("LIMIT_EXCEEDED");
        }

        return tx.homeNotice.update({
          where: { id: parsed.data },
          data: { ...result.data, updatedBy: auth.user.userId },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json({ data: notice });
  } catch (error) {
    if (error instanceof Error && error.message === "LIMIT_EXCEEDED") {
      return NextResponse.json(
        { error: "同一期間に掲載できるお知らせは5件までです" },
        { status: 400 },
      );
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    console.error("[PUT /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "お知らせの更新に失敗しました" },
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
