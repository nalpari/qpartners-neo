import { prisma } from "@/lib/prisma";
import { createCodeHeaderSchema } from "@/lib/schemas/code";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// GET /api/codes — Header Code 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword") ?? undefined;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const headers = await prisma.codeHeader.findMany({
      where: {
        ...(activeOnly && { isActive: true }),
        ...(keyword && {
          OR: [
            { headerCode: { contains: keyword } },
            { headerName: { contains: keyword } },
          ],
        }),
      },
      orderBy: { headerCode: "asc" },
    });

    return NextResponse.json({ data: headers });
  } catch (error) {
    console.error("[GET /api/codes]", error);
    return NextResponse.json(
      { error: "Failed to fetch code headers" },
      { status: 500 },
    );
  }
}

// POST /api/codes — Header Code 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = createCodeHeaderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const existing = await prisma.codeHeader.findUnique({
      where: { headerCode: result.data.headerCode },
    });

    if (existing) {
      return NextResponse.json(
        { error: `headerCode '${result.data.headerCode}' already exists` },
        { status: 409 },
      );
    }

    const header = await prisma.codeHeader.create({ data: result.data });
    return NextResponse.json({ data: header }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/codes]", error);
    return NextResponse.json(
      { error: "Failed to create code header" },
      { status: 500 },
    );
  }
}
