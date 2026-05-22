import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { encryptOutboundCipher } from "@/lib/auto-login-outbound-crypto";
import { AUTO_LOGIN_URL } from "@/lib/config";
import { ConfigError } from "@/lib/errors";
import {
  encryptRequestSchema,
  type EncryptResponse,
} from "@/lib/schemas/auto-login";

/** userId 형식 가드 — middleware 통과 header 지만 defense-in-depth. `+` 포함(하위주소 이메일 지원). */
const USER_ID_PATTERN = /^[A-Za-z0-9@._+\-]{1,128}$/;

// POST /api/auth/auto-login/encrypt — 자동로그인 암호화 URL 생성
//
// 3사(HANASYS/Q.Order/Q.Musubi) 통합 구조 — 2026-04-27 자체 암호화로 전환:
//   1. 인증된 userId 를 Q.Partners 가 직접 AES-128-CBC 암호화 (`encryptOutboundCipher`)
//   2. target 별 URL(`AUTO_LOGIN_URL`)에 cipher 를 붙여 프론트에 반환
//   3. 프론트가 새 탭으로 이동 → 3사 시스템이 cipher 검증 후 자동로그인 처리
//
// 담당자 명시 사실: "암호화 방식은 ORDER/QMUSUBI/DESIGN 다 동일" — 동일 키·IV 로 3사 cipher 일치.
// 외부 게이트웨이(QSP `autoLoginEncryptData`) 호출은 본 라우트에서 제거됨.
export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인 (middleware 에서 X-User-Id 주입)
    const userId = request.headers.get("X-User-Id");
    if (!userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }
    // defense-in-depth — middleware 우회 시나리오 대비 userId 형식 가드.
    // 평문이 그대로 cipher 입력이 되므로 예상 외 길이·제어문자를 사전 차단.
    if (!USER_ID_PATTERN.test(userId)) {
      console.warn("[POST /api/auth/auto-login/encrypt] userId 형식 비정상:", {
        userIdLength: userId.length,
      });
      return NextResponse.json(
        { error: "認証情報が正しくありません" },
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

    // 3. 자체 AES-128-CBC 암호화 — 3사 동일 사양 (담당자 명시 사실, 2026-04-27).
    //    Key: AUTO_LOGIN_AES_KEY (16B, inbound 와 동일 — 2026-05-21 통일), IV: YYYYMMDD_autoL!! (KST 일자).
    const cipher = encryptOutboundCipher(userId);

    // 4. target 별 URL 에 cipher 를 붙여 반환
    const baseUrl = AUTO_LOGIN_URL[target];
    let redirectUrl: string;
    try {
      const u = new URL(baseUrl);
      u.searchParams.set("autoLoginParam1", cipher);
      redirectUrl = u.toString();
    } catch (error: unknown) {
      console.error("[POST /api/auth/auto-login/encrypt] redirect URL 조립 실패:", {
        target,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "リダイレクトURLの生成に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json<EncryptResponse>({ data: { url: redirectUrl } });
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      console.error(
        "[POST /api/auth/auto-login/encrypt] 설정 에러:",
        error.name,
        "— AUTO_LOGIN_AES_KEY 설정 확인 필요",
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
