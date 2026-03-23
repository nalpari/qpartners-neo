import { prisma } from "@/lib/prisma";
import { createCodeDetailSchema } from "@/lib/schemas/code";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id/details — Detail 목록
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const header = await prisma.codeHeader.findUnique({
      where: { id: Number(id) },
    });

    if (!header) {
      return NextResponse.json({ error: "Header not found" }, { status: 404 });
    }

    const details = await prisma.codeDetail.findMany({
      where: {
        headerId: Number(id),
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: details });
  } catch (error) {
    console.error("[GET /api/codes/:id/details]", error);
    return NextResponse.json(
      { error: "Failed to fetch code details" },
      { status: 500 },
    );
  }
}

// POST /api/codes/:id/details — Detail 등록
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = createCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const header = await prisma.codeHeader.findUnique({
      where: { id: Number(id) },
    });

    if (!header) {
      return NextResponse.json({ error: "Header not found" }, { status: 404 });
    }

    // 동일 headerId 내 code 중복 체크
    const existing = await prisma.codeDetail.findUnique({
      where: {
        headerId_code: {
          headerId: Number(id),
          code: result.data.code,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `code '${result.data.code}' already exists in this header` },
        { status: 409 },
      );
    }

    const detail = await prisma.codeDetail.create({
      data: {
        ...result.data,
        headerId: Number(id),
      },
    });

    return NextResponse.json({ data: detail }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/codes/:id/details]", error);
    return NextResponse.json(
      { error: "Failed to create code detail" },
      { status: 500 },
    );
  }
}
