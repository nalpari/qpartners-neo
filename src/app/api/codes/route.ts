import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { createCodeHeaderSchema } from "@/lib/schemas/code";
import { invalidateUserTypeLabelCache } from "@/lib/user-type-labels";

// GET /api/codes — Header Code 목록 (CODES.read — ADMIN 포함 매트릭스 허용)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "read");
    if (auth instanceof NextResponse) return auth;

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
    logError("GET /api/codes", error);
    return NextResponse.json(
      { error: "コードヘッダーの取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/codes — Header Code 등록 (CODES.create — SUPER_ADMIN 전용, ADMIN 은 403)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/codes] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディの形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = createCodeHeaderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が正しくありません", issues: result.error.issues },
        { status: 400 },
      );
    }

    const header = await prisma.codeHeader.create({ data: result.data });
    // USER_TYPE 라벨 캐시 무효화 — 헤더 신규 등록이 즉시 회원관리 응답에 반영되도록.
    if (result.data.headerCode === "USER_TYPE") {
      invalidateUserTypeLabelCache();
    }
    return NextResponse.json({ data: header }, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "既に存在するヘッダーコードです" },
        { status: 409 },
      );
    }
    logError("POST /api/codes", error);
    return NextResponse.json(
      { error: "コードヘッダーの作成に失敗しました" },
      { status: 500 },
    );
  }
}
