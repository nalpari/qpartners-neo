import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyToken, COOKIE_NAME } from "@/lib/jwt";

const VALID_FILE_TYPES = new Set(["RECEIPT", "CERT1", "CERT2"]);

// GET /api/mypage/seko-file — 시공점 첨부파일 다운로드
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 },
      );
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "토큰이 만료되었거나 유효하지 않습니다" },
        { status: 401 },
      );
    }

    // 시공점 회원 전용
    if (user.userTp !== "SEKO") {
      return NextResponse.json(
        { error: "施工店会員のみ利用可能です" },
        { status: 403 },
      );
    }

    const fileType = request.nextUrl.searchParams.get("fileType");
    if (!fileType || !VALID_FILE_TYPES.has(fileType)) {
      return NextResponse.json(
        { error: "fileType은 RECEIPT, CERT1, CERT2 중 하나여야 합니다" },
        { status: 400 },
      );
    }

    // TODO: AS-IS Seko File Download API 프록시 구현
    // 현재는 엔드포인트 미확인 상태 — 확인 후 구현
    return NextResponse.json(
      { error: "시공점 파일 다운로드 API가 아직 연동되지 않았습니다" },
      { status: 501 },
    );
  } catch (error) {
    console.error("[GET /api/mypage/seko-file]", error);
    return NextResponse.json(
      { error: "시공점 파일 다운로드 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
