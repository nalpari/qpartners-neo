import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AUTO_LOGIN_URL } from "@/lib/config";
import { encryptAutoLogin } from "@/lib/auto-login-crypto";
import { ConfigError } from "@/lib/errors";
import { encryptRequestSchema } from "@/lib/schemas/auto-login";
import type { AutoLoginTarget } from "@/lib/schemas/auto-login";

/**
 * 3사(HANASYS / Q.Order / Q.Musubi) 자동로그인 이동 URL 맵.
 * Q.Partners가 자체 AES-256로 암호화한 cipher를 `?autoLoginParam1=` 로 부착하여 이동.
 */
const AUTO_LOGIN_TARGET_URL: Record<AutoLoginTarget, string> = {
  hanasys: AUTO_LOGIN_URL.hanasys,
  qOrder: AUTO_LOGIN_URL.qOrder,
  qMusubi: AUTO_LOGIN_URL.qMusubi,
};

// POST /api/auth/auto-login/encrypt — 자동로그인 암호화 URL 생성
//
// 3사(HANASYS/Q.Order/Q.Musubi) 모두 동일한 자체 AES-256-CBC 암호화 사용
// (키 = SHA-256(YYYYMMDD_KST + AUTO_LOGIN_AES_KEY)).
// cipher 평문은 userId 단독이며, 대상 시스템별 고유 경로에 `?autoLoginParam1=<cipher>` 를 붙여 반환.
export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인 (middleware에서 X-User-Id 주입)
    const userId = request.headers.get("X-User-Id");
    if (!userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }

    // 2. 요청 바디 파싱 (target)
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/auth/auto-login/encrypt] request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const parsedBody = encryptRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      // 스키마 세부(issues)는 서버 로그에만 기록 — 다른 route(signup/inquiry)와 동일하게 클라이언트 노출 금지
      console.warn(
        "[POST /api/auth/auto-login/encrypt] target 검증 실패:",
        parsedBody.error.issues,
      );
      return NextResponse.json(
        { error: "targetパラメータが正しくありません" },
        { status: 400 },
      );
    }
    const { target } = parsedBody.data;

    return encryptAndAssemble(userId, AUTO_LOGIN_TARGET_URL[target]);
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      console.error(
        "[POST /api/auth/auto-login/encrypt] 설정 에러:",
        error.message,
      );
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    console.error("[POST /api/auth/auto-login/encrypt] 예상치 못한 에러:", {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}

/** 자체 AES-256 암호화 후 대상 시스템 URL에 cipher 부착 */
function encryptAndAssemble(userId: string, baseUrl: string) {
  let cipherText: string;
  try {
    cipherText = encryptAutoLogin(userId);
  } catch (error) {
    console.error("[POST /api/auth/auto-login/encrypt] 자체 AES256 암호화 실패:", error);
    return NextResponse.json(
      { error: "暗号化処理に失敗しました" },
      { status: 500 },
    );
  }

  let redirectUrl: string;
  try {
    const target = new URL(baseUrl);
    target.searchParams.set("autoLoginParam1", cipherText);
    redirectUrl = target.toString();
  } catch (error: unknown) {
    console.error("[POST /api/auth/auto-login/encrypt] 자체 AES256 URL 조립 실패:", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "リダイレクトURLの生成に失敗しました" },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { url: redirectUrl } });
}
