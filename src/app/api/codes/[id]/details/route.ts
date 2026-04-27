import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  createCodeDetailSchema,
  idParamSchema,
  validateSecAuthValidityCode,
} from "@/lib/schemas/code";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id/details — Detail 목록 (CODES.read — ADMIN 포함 매트릭스 허용)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "read");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      console.warn("[GET /api/codes/:id/details] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }

    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
    });

    if (!header) {
      return NextResponse.json({ error: "ヘッダーコードが見つかりません" }, { status: 404 });
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
    logError("GET /api/codes/:id/details", error);
    return NextResponse.json(
      { error: "コード詳細の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/codes/:id/details — Detail 등록 (CODES.create — SUPER_ADMIN 전용, ADMIN 은 403)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "create");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      console.warn("[POST /api/codes/:id/details] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/codes/:id/details] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディの形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = createCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が正しくありません", issues: result.error.issues },
        { status: 400 },
      );
    }

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
    });

    if (!header) {
      return NextResponse.json({ error: "ヘッダーコードが見つかりません" }, { status: 404 });
    }

    // SEC_AUTH_VALIDITY 헤더에 한해 1~90 정수 상하한 가드 (Boston 리뷰 HIGH #2)
    const validity = validateSecAuthValidityCode(header.headerCode, result.data.code);
    if (!validity.ok) {
      return NextResponse.json({ error: validity.message }, { status: 400 });
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
          { error: "このヘッダー内で既に存在するコードです" },
          { status: 409 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "ヘッダーコードが見つかりません" },
          { status: 404 },
        );
      }
    }
    logError("POST /api/codes/:id/details", error);
    return NextResponse.json(
      { error: "コード詳細の作成に失敗しました" },
      { status: 500 },
    );
  }
}
