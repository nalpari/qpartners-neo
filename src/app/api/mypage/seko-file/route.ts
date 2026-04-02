import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { sekoFileQuerySchema } from "@/lib/schemas/mypage";

// GET /api/mypage/seko-file — 시공점 첨부파일 다운로드
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
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

    const queryResult = sekoFileQuerySchema.safeParse({
      fileType: request.nextUrl.searchParams.get("fileType"),
    });
    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: queryResult.error.issues },
        { status: 400 },
      );
    }

    // TODO: AS-IS Seko File Download API 프록시 구현
    // 현재는 엔드포인트 미확인 상태 — 확인 후 구현
    return NextResponse.json(
      { error: "施工店ファイルダウンロードAPIはまだ連動されていません" },
      { status: 501 },
    );
  } catch (error) {
    console.error("[GET /api/mypage/seko-file]", error);
    return NextResponse.json(
      { error: "施工店ファイルダウンロード中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
