import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { canModifyResource, isAuthorSuperAdmin, requireAdmin } from "@/lib/auth";
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

    // 조회 실패해도 단건 조회 자체는 성공해야 함 — fail-closed(true) 로 처리해 ADMIN 수정 버튼 숨김
    let authorIsSuperAdmin: boolean;
    try {
      authorIsSuperAdmin = await isAuthorSuperAdmin({
        userType: notice.userType,
        userId: notice.userId,
      });
    } catch (err) {
      console.error("[GET /api/home-notices/:id] authorIsSuperAdmin 조회 실패 — fail-closed(true):", err);
      authorIsSuperAdmin = true;
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
      authorIsSuperAdmin,
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
      return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = updateHomeNoticeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: result.error.issues },
        { status: 400 },
      );
    }

    // startAt 또는 endAt 한쪽만 보낸 경우, 기존 레코드와 cross-validation
    const existing = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
      select: { startAt: true, endAt: true, userType: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }

    // SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
    if (!(await canModifyResource(auth.user, existing))) {
      return NextResponse.json(
        { error: "修正する権限がありません" },
        { status: 403 },
      );
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
      return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });
    }

    const existing = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
      select: { userType: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }

    if (!(await canModifyResource(auth.user, existing))) {
      return NextResponse.json(
        { error: "削除する権限がありません" },
        { status: 403 },
      );
    }

    await prisma.homeNotice.delete({ where: { id: parsed.data } });

    return NextResponse.json({ data: { id: parsed.data } });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    console.error("[DELETE /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "お知らせの削除に失敗しました" },
      { status: 500 },
    );
  }
}
