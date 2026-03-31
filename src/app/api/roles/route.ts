import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRoleSchema } from "@/lib/schemas/permission";

// GET /api/roles — 권한 목록 (관리자 전용)
export async function GET(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const roles = await prisma.qpRole.findMany({
      where: {
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { roleCode: "asc" },
    });

    return NextResponse.json({ data: roles });
  } catch (error) {
    console.error("[GET /api/roles]", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 },
    );
  }
}

// POST /api/roles — 권한 추가
export async function POST(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createRoleSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const role = await prisma.qpRole.create({ data: result.data });
    return NextResponse.json({ data: role }, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 존재하는 roleCode입니다" },
        { status: 409 },
      );
    }
    console.error("[POST /api/roles]", error);
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 },
    );
  }
}
