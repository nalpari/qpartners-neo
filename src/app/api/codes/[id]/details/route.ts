import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { prisma } from "@/lib/prisma";
import { createCodeDetailSchema, idParamSchema } from "@/lib/schemas/code";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id/details — Detail 목록
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
    });

    if (!header) {
      return NextResponse.json({ error: "Header not found" }, { status: 404 });
    }

    const details = await prisma.codeDetail.findMany({
      where: {
        headerId: parsed.data,
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

    const result = createCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
    });

    if (!header) {
      return NextResponse.json({ error: "Header not found" }, { status: 404 });
    }

    const detail = await prisma.codeDetail.create({
      data: {
        ...result.data,
        headerId: parsed.data,
      },
    });

    return NextResponse.json({ data: detail }, { status: 201 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Duplicate code in this header" },
          { status: 409 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Header deleted or does not exist" },
          { status: 409 },
        );
      }
    }
    console.error("[POST /api/codes/:id/details]", error);
    return NextResponse.json(
      { error: "Failed to create code detail" },
      { status: 500 },
    );
  }
}
