import { prisma } from "@/lib/prisma";
import { updateCodeDetailSchema } from "@/lib/schemas/code";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; detailId: string }> };

// PUT /api/codes/:id/details/:detailId — Detail 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, detailId } = await params;
    const body = await request.json();
    const result = updateCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const detail = await prisma.$transaction(async (tx) => {
      const existing = await tx.codeDetail.findFirst({
        where: { id: Number(detailId), headerId: Number(id) },
      });

      if (!existing) return null;

      // code 변경 시 중복 체크
      if (result.data.code && result.data.code !== existing.code) {
        const duplicate = await tx.codeDetail.findUnique({
          where: {
            headerId_code: {
              headerId: Number(id),
              code: result.data.code,
            },
          },
        });

        if (duplicate) {
          throw new Error(
            `DUPLICATE:code '${result.data.code}' already exists in this header`,
          );
        }
      }

      return tx.codeDetail.update({
        where: { id: Number(detailId) },
        data: result.data,
      });
    });

    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: detail });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("DUPLICATE:")) {
      return NextResponse.json(
        { error: error.message.slice("DUPLICATE:".length) },
        { status: 409 },
      );
    }
    console.error("[PUT /api/codes/:id/details/:detailId]", error);
    return NextResponse.json(
      { error: "Failed to update code detail" },
      { status: 500 },
    );
  }
}

// DELETE /api/codes/:id/details/:detailId — Detail 물리 삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, detailId } = await params;

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.codeDetail.findFirst({
        where: { id: Number(detailId), headerId: Number(id) },
      });

      if (!existing) return false;

      await tx.codeDetail.delete({
        where: { id: Number(detailId) },
      });

      return true;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE /api/codes/:id/details/:detailId]", error);
    return NextResponse.json(
      { error: "Failed to delete code detail" },
      { status: 500 },
    );
  }
}
