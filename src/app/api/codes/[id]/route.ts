import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCodeHeaderSchema } from "@/lib/schemas/code";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id — Header 단건 조회 (CODES.read — ADMIN 포함 매트릭스 허용)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "CODES", "read");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      console.warn("[GET /api/codes/:id] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
      include: { details: { orderBy: { sortOrder: "asc" } } },
    });

    if (!header) {
      return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ data: header });
  } catch (error) {
    logError("GET /api/codes/:id", error);
    return NextResponse.json(
      { error: "コードヘッダーの取得に失敗しました" },
      { status: 500 },
    );
  }
}

// PUT /api/codes/:id — Header 수정 (CODES.update — SUPER_ADMIN 전용, ADMIN 은 403)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "CODES", "update");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      console.warn("[PUT /api/codes/:id] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/codes/:id] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディの形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = updateCodeHeaderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が正しくありません", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
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
      return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    }
    logError("PUT /api/codes/:id", error);
    return NextResponse.json(
      { error: "コードヘッダーの更新に失敗しました" },
      { status: 500 },
    );
  }
}
