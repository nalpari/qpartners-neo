import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";

// GET /api/mypage/seko-info — 시공점 시공ID 정보 조회
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

    // TODO: AS-IS Seko User Info API 프록시 구현
    // 현재는 엔드포인트 미확인 상태 — 확인 후 구현
    return NextResponse.json(
      { error: "施工店情報照会APIはまだ連動されていません" },
      { status: 501 },
    );
  } catch (error) {
    console.error("[GET /api/mypage/seko-info]", error);
    return NextResponse.json(
      { error: "施工店情報の照会中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
