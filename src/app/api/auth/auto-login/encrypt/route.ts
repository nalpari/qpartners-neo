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
 *
 * 기본 목록은 하드코딩된 fallback이며, 환경에 따라 QSP가 반환하는 호스트가 다를 수 있으므로
 * `AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS` env(콤마 구분)로 덮어쓸 수 있음.
 * 예) `AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS="hanasys.jp,hanasys.co.jp,q-cells.jp,qsalesplatform.com"`
 */
const DEFAULT_ALLOWED_QSP_REDIRECT_HOSTS = [
  "hanasys.jp",
  "hanasys.co.jp",
  "q-cells.jp",
] as const;

function getAllowedQspRedirectHosts(): readonly string[] {
  const raw = process.env.AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS?.trim();
  if (!raw) return DEFAULT_ALLOWED_QSP_REDIRECT_HOSTS;
  const parsed = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  if (parsed.length === 0) return DEFAULT_ALLOWED_QSP_REDIRECT_HOSTS;
  return parsed;
}

function isAllowedQspRedirectUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = getAllowedQspRedirectHosts();
    return allowedHosts.some((allowed) => {
      if (host === allowed) return true;
      // 서브도메인 허용 — `foo.hanasys.jp` OK, `evilhanasys.jp` 차단
      return (
        host.length > allowed.length + 1 &&
        host.endsWith(`.${allowed}`)
      );
    });
  } catch (error: unknown) {
    console.warn("[auto-login] QSP redirect URL 파싱 실패:", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * QSP autoLoginEncryptData 응답.
 * - data.userId: 암호문(non-empty)
 * - data.url: 이동 base URL (HANASYS용) — URL 형식만 검증, host allowlist는 후속 단계에서 별도 검증
 * - resultCode / resultMessage: 공통 응답 메타 — 200 이외는 상위 로직에서 502로 반환
 *
 * host allowlist 를 `.refine` 으로 묶지 않는 이유:
 *   스키마 실패 로그가 "스키마 불일치"로 뭉개져 실제 원인 구분 불가.
 *   URL 형식 실패 / host 거부 / userId 누락 등을 별도 분기로 로깅하여 운영 가시성 확보.
 */
const qspEncryptResponseSchema = z.object({
  resultCode: z.number().int().optional(),
  resultMessage: z.string().optional(),
  data: z.object({
    userId: z.string().min(1, "QSP 암호문이 비어있습니다"),
    url: z.string().url(),
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
//     가이드에 명시된 {q-order-domain}/eos/login/autoLogin 또는 /qm/login/autoLogin 경로에 조립
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
    // raw body 직접 로깅 금지 — 스키마 밖 경로(예상치 못한 필드, QSP 내부 stack trace 등) 유출 위험.
    // 구조 힌트(top-level keys / 타입)만 기록하여 어느 필드가 문제인지 특정 가능하게 함.
    const responseBodyShape =
      qspBody != null && typeof qspBody === "object"
        ? Object.keys(qspBody as Record<string, unknown>)
        : typeof qspBody;
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 스키마 불일치:", {
      issues: parsed.error.issues,
      responseBodyShape,
    });
    return NextResponse.json(
      { error: "暗号化サーバーの応答形式が正しくありません" },
      { status: 502 },
    );
  }

  // QSP 계약상 성공은 resultCode=200. 스키마가 optional이지만 값이 있으면 반드시 200이어야 함.
  if (parsed.data.resultCode !== undefined && parsed.data.resultCode !== 200) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP resultCode 비정상:", {
      resultCode: parsed.data.resultCode,
      resultMessage: parsed.data.resultMessage,
    });
    return NextResponse.json(
      { error: "暗号化サーバーの応答に失敗しました" },
      { status: 502 },
    );
  }

  const { userId: cipherText, url: qspUrl } = parsed.data.data;

  // host allowlist 검증 — 스키마에서 분리하여 실패 원인을 별도 분기로 명시.
  // Open Redirect 방어 + dev 내부 도메인/사설 IP 등 예상치 못한 host 반환 시 즉시 가시화.
  if (!isAllowedQspRedirectUrl(qspUrl)) {
    let parsedHost = "<invalid-url>";
    try {
      parsedHost = new URL(qspUrl).hostname;
    } catch (error: unknown) {
      // URL 파싱 실패는 host check 이전에 스키마 url() 에서 걸리지만 방어적 처리
      console.warn("[POST /api/auth/auto-login/encrypt] host 추출 중 URL 파싱 실패:", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    console.error(
      "[POST /api/auth/auto-login/encrypt] QSP 응답 URL host 허용되지 않음 — allowlist 확장 필요 가능:",
      {
        host: parsedHost,
        allowedHosts: getAllowedQspRedirectHosts(),
      },
    );
    return NextResponse.json(
      { error: "暗号化サーバーの応答形式が正しくありません" },
      { status: 502 },
    );
  }
  // 문자열 연결 대신 URL 객체 사용 — QSP가 반환하는 url에 ?가 포함/미포함 어느 쪽이든 안전.
  // searchParams.set은 값을 자동으로 인코딩하므로 encodeURIComponent 불필요.
  let redirectUrl: string;
  try {
    const target = new URL(qspUrl);
    target.searchParams.set("autoLoginParam1", cipherText);
    redirectUrl = target.toString();
  } catch (error: unknown) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP url 조립 실패:", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "暗号化サーバーの応答形式が正しくありません" },
      { status: 502 },
    );
  }

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
