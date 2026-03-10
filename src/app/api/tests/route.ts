import { prisma } from "@/lib/prisma";
import { createTestSchema } from "@/lib/schemas/test";
import { NextRequest, NextResponse } from "next/server";

// GET /api/tests — 전체 목록 조회
export async function GET() {
  const tests = await prisma.test.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tests);
}

// POST /api/tests — 생성
export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = createTestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const test = await prisma.test.create({ data: result.data });
  return NextResponse.json(test, { status: 201 });
}
