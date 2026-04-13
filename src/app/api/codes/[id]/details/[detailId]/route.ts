import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCodeDetailSchema } from "@/lib/schemas/code";

type Params = { params: Promise<{ id: string; detailId: string }> };

// PUT /api/codes/:id/details/:detailId — Detail 수정 (관리자 전용)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id, detailId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      console.warn("[PUT /api/codes/:id/details/:detailId] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }
    const parsedDetailId = idParamSchema.safeParse(detailId);
    if (!parsedDetailId.success) {
      console.warn("[PUT /api/codes/:id/details/:detailId] 詳細ID 파싱 실패:", detailId);
      return NextResponse.json({ error: "詳細IDの形式が正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/codes/:id/details/:detailId] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディの形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = updateCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が正しくありません", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 },
      );
    }

    const detail = await prisma.codeDetail.update({
      where: { id: parsedDetailId.data, headerId: parsedId.data },
      data: result.data,
    });

    return NextResponse.json({ data: detail });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "このヘッダー内で既に存在するコードです" },
          { status: 409 },
        );
      }
    }
    console.error("[PUT /api/codes/:id/details/:detailId]", error);
    return NextResponse.json(
      { error: "コード詳細の更新に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/codes/:id/details/:detailId — Detail 물리 삭제 (관리자 전용)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id, detailId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      console.warn("[DELETE /api/codes/:id/details/:detailId] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }
    const parsedDetailId = idParamSchema.safeParse(detailId);
    if (!parsedDetailId.success) {
      console.warn("[DELETE /api/codes/:id/details/:detailId] 詳細ID 파싱 실패:", detailId);
      return NextResponse.json({ error: "詳細IDの形式が正しくありません" }, { status: 400 });
    }

    // 감사 로그 — 물리 삭제는 복구가 어려우므로 관리자 user id와 대상 ID 기록
    console.info(
      `[DELETE /api/codes/:id/details/:detailId] userId=${auth.user.userId} headerId=${parsedId.data} detailId=${parsedDetailId.data}`,
    );

    await prisma.codeDetail.delete({
      where: { id: parsedDetailId.data, headerId: parsedId.data },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    }
    console.error("[DELETE /api/codes/:id/details/:detailId]", error);
    return NextResponse.json(
      { error: "コード詳細の削除に失敗しました" },
      { status: 500 },
    );
  }
}
