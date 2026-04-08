import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// 비인증 공개 조회 허용 화이트리스트 — 신규 공개 코드 추가 시 본 목록에 반드시 등록
// (middleware.ts의 PUBLIC_GET_PATTERNS와 짝을 이룸)
const ALLOWED_PUBLIC_HEADER_CODES = new Set<string>([
  "INQUIRY_TYPE", // 문의하기 문의 유형
]);

// GET /api/codes/lookup?headerCode=INQUIRY_TYPE — 공통코드 공개 조회 (headerCode 기반)
export async function GET(request: NextRequest) {
  try {
    const headerCode = request.nextUrl.searchParams.get("headerCode");

    if (!headerCode || !/^[A-Z0-9_]{1,50}$/.test(headerCode)) {
      console.warn("[GET /api/codes/lookup] headerCode 파라미터 누락 또는 형식 불일치:", headerCode);
      return NextResponse.json(
        { error: "headerCodeパラメータが不正です" },
        { status: 400 },
      );
    }

    // 공개 화이트리스트에 등록되지 않은 headerCode는 404로 응답 (enumeration 방어)
    // — 401/403으로 응답하면 "존재하지만 비공개"가 노출되므로 404로 통일
    if (!ALLOWED_PUBLIC_HEADER_CODES.has(headerCode)) {
      console.warn("[GET /api/codes/lookup] 공개 화이트리스트 미등록 headerCode:", headerCode);
      return NextResponse.json(
        { error: "該当するコードが見つかりません" },
        { status: 404 },
      );
    }

    const header = await prisma.codeHeader.findFirst({
      where: { headerCode, isActive: true },
      select: { id: true, headerCode: true, headerName: true },
    });

    if (!header) {
      console.warn("[GET /api/codes/lookup] 해당 코드 없음:", headerCode);
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
