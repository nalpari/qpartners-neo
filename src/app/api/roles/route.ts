import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRoleSchema } from "@/lib/schemas/permission";

// GET /api/roles — 권한 목록 (ADM_PERMISSION.read 매트릭스 기반)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "read");
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
      { error: "権限一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/roles — 권한 추가 (ADM_PERMISSION.create — SUPER_ADMIN 전용, ADMIN 은 403)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/roles] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = createRoleSchema.safeParse(body);

    if (!result.success) {
      // 첫 위반 메시지를 그대로 노출 — 사용자가 어떤 필드의 어떤 규칙을 위반했는지 즉시 인지.
      // roleCode 형식 위반 케이스별 메시지가 그대로 전달됨 (Redmine #2165).
      const firstMessage = result.error.issues[0]?.message ?? "入力値が不正です";
      return NextResponse.json(
        { error: firstMessage, issues: result.error.issues },
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
        { error: "既に存在するroleCodeです" },
        { status: 409 },
      );
    }
    console.error("[POST /api/roles]", error);
    return NextResponse.json(
      { error: "権限の作成に失敗しました" },
      { status: 500 },
    );
  }
}
