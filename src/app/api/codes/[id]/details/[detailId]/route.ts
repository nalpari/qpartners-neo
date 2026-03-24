import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCodeDetailSchema } from "@/lib/schemas/code";

type Params = { params: Promise<{ id: string; detailId: string }> };

// PUT /api/codes/:id/details/:detailId — Detail 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, detailId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    const parsedDetailId = idParamSchema.safeParse(detailId);
    if (!parsedId.success || !parsedDetailId.success) {
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

    const result = updateCodeDetailSchema.safeParse(body);

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

    const detail = await prisma.codeDetail.update({
      where: { id: parsedDetailId.data, headerId: parsedId.data },
      data: result.data,
    });

    return NextResponse.json({ data: detail });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Duplicate code in this header" },
          { status: 409 },
        );
      }
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
    const parsedId = idParamSchema.safeParse(id);
    const parsedDetailId = idParamSchema.safeParse(detailId);
    if (!parsedId.success || !parsedDetailId.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await prisma.codeDetail.delete({
      where: { id: parsedDetailId.data, headerId: parsedId.data },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/codes/:id/details/:detailId]", error);
    return NextResponse.json(
      { error: "Failed to delete code detail" },
      { status: 500 },
    );
  }
}
