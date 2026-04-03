import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// GET /api/codes/lookup?headerCode=INQUIRY_TYPE — 공통코드 공개 조회 (headerCode 기반)
export async function GET(request: NextRequest) {
  try {
    const headerCode = request.nextUrl.searchParams.get("headerCode");

    if (!headerCode) {
      return NextResponse.json(
        { error: "headerCodeパラメータは必須です" },
        { status: 400 },
      );
    }

    const header = await prisma.codeHeader.findUnique({
      where: { headerCode },
      select: { id: true, headerCode: true, headerName: true },
    });

    if (!header) {
      return NextResponse.json(
        { error: "該当するコードが見つかりません" },
        { status: 404 },
      );
    }

    const details = await prisma.codeDetail.findMany({
      where: { headerId: header.id, isActive: true },
      select: {
        code: true,
        displayCode: true,
        codeName: true,
        codeNameEtc: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: details });
  } catch (error) {
    console.error("[GET /api/codes/lookup] 공통코드 조회 실패", error);
    return NextResponse.json(
      { error: "コードの取得に失敗しました" },
      { status: 500 },
    );
  }
}
