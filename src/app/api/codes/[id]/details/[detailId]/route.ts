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

    const existing = await prisma.codeDetail.findFirst({
      where: { id: Number(detailId), headerId: Number(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // code 변경 시 중복 체크
    if (result.data.code && result.data.code !== existing.code) {
      const duplicate = await prisma.codeDetail.findUnique({
        where: {
          headerId_code: {
            headerId: Number(id),
            code: result.data.code,
          },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: `code '${result.data.code}' already exists in this header` },
          { status: 409 },
        );
      }
    }

    const detail = await prisma.codeDetail.update({
      where: { id: Number(detailId) },
      data: result.data,
    });

    return NextResponse.json({ data: detail });
  } catch (error) {
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

    const existing = await prisma.codeDetail.findFirst({
      where: { id: Number(detailId), headerId: Number(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.codeDetail.delete({
      where: { id: Number(detailId) },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE /api/codes/:id/details/:detailId]", error);
    return NextResponse.json(
      { error: "Failed to delete code detail" },
      { status: 500 },
    );
  }
}
