import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { verifyToken, COOKIE_NAME } from "@/lib/jwt";

// GET /api/auth/login-user-info — 현재 로그인 사용자 정보
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "인증되지 않은 사용자입니다" },
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

    // sekoToken(SEKO Connector Bearer) 은 서버 전용 — JWT 페이로드에만 보관하고 클라이언트
    // 응답에서는 제외한다. login 라우트와 동일 패턴(undefined 는 JSON 직렬화에서 생략됨).
    return NextResponse.json({ data: { ...user, sekoToken: undefined } });
  } catch (error) {
    // verifyToken 은 ConfigError(JWT_SECRET 미설정)를 의도적으로 재던진다 —
    // 최상위 catch 가 없으면 스택 트레이스가 클라이언트로 유출된다(.claude/rules/api.md).
    if (error instanceof ConfigError) {
      console.error("[GET /api/auth/login-user-info] 설정 오류 — JWT_SECRET 확인 필요:", error);
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    console.error("[GET /api/auth/login-user-info]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
