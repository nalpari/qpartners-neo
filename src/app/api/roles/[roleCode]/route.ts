import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  roleCodeParamSchema,
  updateRoleSchema,
} from "@/lib/schemas/permission";

type Params = { params: Promise<{ roleCode: string }> };

// PUT /api/roles/:roleCode — 권한 수정 (ADM_PERMISSION.update — SUPER_ADMIN 전용)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "update");
    if (auth instanceof NextResponse) return auth;

    const { roleCode } = await params;
    const parsedCode = roleCodeParamSchema.safeParse(roleCode);
    if (!parsedCode.success) {
      const firstMessage = parsedCode.error.issues[0]?.message ?? "roleCodeが不正です";
      return NextResponse.json(
        { error: firstMessage, issues: parsedCode.error.issues },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/roles/:roleCode] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = updateRoleSchema.safeParse(body);

    if (!result.success) {
      const firstMessage = result.error.issues[0]?.message ?? "入力値が不正です";
      return NextResponse.json(
        { error: firstMessage, issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新対象のフィールドがありません" },
        { status: 400 },
      );
    }

    const role = await prisma.qpRole.update({
      where: { roleCode: parsedCode.data },
      data: result.data,
    });

    return NextResponse.json({ data: role });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "指定された権限が見つかりません" }, { status: 404 });
    }
    console.error("[PUT /api/roles/:roleCode]", error);
    return NextResponse.json(
      { error: "権限の更新に失敗しました" },
      { status: 500 },
    );
  }
}
