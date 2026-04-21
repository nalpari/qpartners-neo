import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTO_LOGIN_URL, QSP_API } from "@/lib/config";
import { encryptAutoLogin } from "@/lib/auto-login-crypto";
import { ConfigError } from "@/lib/errors";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import { encryptRequestSchema } from "@/lib/schemas/auto-login";
import type { AutoLoginTarget } from "@/lib/schemas/auto-login";

/**
 * QSP 응답 `data.url` 허용 호스트 — Open Redirect 방어.
 * 정확 일치 또는 서브도메인(*.hanasys.jp 등) 허용.
 */
const ALLOWED_QSP_REDIRECT_HOSTS = ["hanasys.jp", "hanasys.co.jp", "q-cells.jp"];

function isAllowedQspRedirectUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return ALLOWED_QSP_REDIRECT_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch (error: unknown) {
    console.warn("[auto-login] QSP redirect URL 파싱 실패:", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** QSP autoLoginEncryptData 응답 — data.userId: 암호문(non-empty), data.url: 이동 base URL (HANASYS용) */
const qspEncryptResponseSchema = z.object({
  data: z.object({
    userId: z.string().min(1, "QSP 암호문이 비어있습니다"),
    url: z
      .string()
      .url()
      .refine(isAllowedQspRedirectUrl, "허용되지 않은 redirect host"),
  }),
});

/** Q.Order / Q.Musubi 대상 URL 맵 — 자체 AES256로 암호화한 cipher를 붙여 반환 */
const SELF_ENCRYPT_TARGET_URL: Record<
  Exclude<AutoLoginTarget, "hanasys">,
  string
> = {
  qOrder: AUTO_LOGIN_URL.qOrder,
  qMusubi: AUTO_LOGIN_URL.qMusubi,
};

// POST /api/auth/auto-login/encrypt — 자동로그인 암호화 URL 생성
//
// target별 분기:
//   - hanasys: QSP autoLoginEncryptData API 경유 (QSP가 반환한 HANASYS URL 그대로 사용)
//   - qOrder / qMusubi: 자체 AES256 암호화(YYYYMMDD + AUTO_LOGIN_AES_KEY) 후
//     가이드에 명시된 {qsp-domain}/eos/login/autoLogin 또는 /qm/login/autoLogin 경로에 조립
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

    if (target === "hanasys") {
      return await encryptViaQsp(userId);
    }

    return encryptSelf(userId, SELF_ENCRYPT_TARGET_URL[target]);
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

/** HANASYS DESIGN — QSP autoLoginEncryptData API 호출 후 QSP 반환 URL 사용 */
async function encryptViaQsp(userId: string) {
  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      `${QSP_API.autoLoginEncrypt}?autoLoginParam1=${encodeURIComponent(userId)}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "autoLoginEncryptData",
        callerRoute: "[POST /api/auth/auto-login/encrypt]",
        userId: maskUserId(userId),
      },
    );
  } catch (error) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 암호화 API 호출 실패:", error);
    return NextResponse.json(
      { error: "暗号化サーバーに接続できません" },
      { status: 502 },
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "暗号化サーバーエラーが発生しました" },
      { status: 502 },
    );
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 파싱 실패:", error);
    return NextResponse.json(
      { error: "暗号化サーバーの応答を処理できません" },
      { status: 502 },
    );
  }

  const parsed = qspEncryptResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 스키마 불일치:", parsed.error.issues);
    return NextResponse.json(
      { error: "暗号化サーバーの応答形式が正しくありません" },
      { status: 502 },
    );
  }

  const { userId: cipherText, url: qspUrl } = parsed.data.data;
  const redirectUrl = `${qspUrl}${encodeURIComponent(cipherText)}`;

  return NextResponse.json({ data: { url: redirectUrl } });
}

/** Q.Order / Q.Musubi — 자체 AES256 암호화 후 대상 URL에 조립 */
function encryptSelf(userId: string, baseUrl: string) {
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

  const redirectUrl = `${baseUrl}?autoLoginParam1=${encodeURIComponent(cipherText)}`;
  return NextResponse.json({ data: { url: redirectUrl } });
}
