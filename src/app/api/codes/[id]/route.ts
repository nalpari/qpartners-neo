import { prisma } from "@/lib/prisma";
import { updateCodeHeaderSchema } from "@/lib/schemas/code";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id — Header 단건 조회
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const header = await prisma.codeHeader.findUnique({
      where: { id: Number(id) },
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
    const body = await request.json();
    const result = updateCodeHeaderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const existing = await prisma.codeHeader.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const header = await prisma.codeHeader.update({
      where: { id: Number(id) },
      data: result.data,
    });

    return NextResponse.json({ data: header });
  } catch (error) {
    console.error("[PUT /api/codes/:id]", error);
    return NextResponse.json(
      { error: "Failed to update code header" },
      { status: 500 },
    );
  }
}
