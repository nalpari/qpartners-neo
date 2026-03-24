import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCodeHeaderSchema } from "@/lib/schemas/code";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id — Header 단건 조회
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
      include: { details: { orderBy: { sortOrder: "asc" } } },
    });

    if (!header) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: header });
  } catch (error) {
    console.error("[GET /api/codes/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch code header" },
      { status: 500 },
    );
  }
}

// PUT /api/codes/:id — Header 수정 (headerCode 수정 불가)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
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

    const result = updateCodeHeaderSchema.safeParse(body);

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

    const header = await prisma.codeHeader.update({
      where: { id: parsed.data },
      data: result.data,
    });

    return NextResponse.json({ data: header });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PUT /api/codes/:id]", error);
    return NextResponse.json(
      { error: "Failed to update code header" },
      { status: 500 },
    );
  }
}
