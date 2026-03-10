import { prisma } from "@/lib/prisma";
import { updateTestSchema } from "@/lib/schemas/test";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/tests/:id — 단건 조회
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const test = await prisma.test.findUnique({
      where: { id: Number(id) },
    });

    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(test);
  } catch (error) {
    console.error(`[GET /api/tests/:id]`, error);
    return NextResponse.json(
      { error: "Failed to fetch test" },
      { status: 500 },
    );
  }
}

// PATCH /api/tests/:id — 수정
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = updateTestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const test = await prisma.test.update({
      where: { id: Number(id) },
      data: result.data,
    });
    return NextResponse.json(test);
  } catch (error) {
    console.error(`[PATCH /api/tests/:id]`, error);
    return NextResponse.json(
      { error: "Failed to update test" },
      { status: 500 },
    );
  }
}

// DELETE /api/tests/:id — 삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.test.delete({
      where: { id: Number(id) },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`[DELETE /api/tests/:id]`, error);
    return NextResponse.json(
      { error: "Failed to delete test" },
      { status: 500 },
    );
  }
}
