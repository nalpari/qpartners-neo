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
 * QSP 응답 `data.url` 허용 호스트 — Open Redirect 방어 (FQDN 정확 일치만 허용).
 *
 * HANASYS target 전용 endpoint 이므로 HANASYS dev/prod FQDN 만 기본 허용.
 * 서브도메인 와일드카드 금지 — CMS/사용자 콘텐츠 서브도메인으로 cipher 탈취 방지.
 *
 * 운영/QA 에서 호스트 변경 필요 시 `AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS` env(콤마 구분)로 덮어쓰기.
 * 예) `AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS="www.hanasys.jp,dev.hanasys.jp"`
 */
const DEFAULT_ALLOWED_QSP_REDIRECT_HOSTS = [
  "www.hanasys.jp", // prod
  "dev.hanasys.jp", // dev
] as const;

/**
 * env entry 검증 패턴 — ASCII hostname(라벨 ≥ 2, TLD ≥ 2자).
 * 포트/스킴 포함, TLD-only(`.jp`), punycode 는 silent misconfig 로 전역 open redirect 유발 가능 → 차단.
 */
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function getAllowedQspRedirectHosts(): readonly string[] {
  const raw = process.env.AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS?.trim();
  if (!raw) return DEFAULT_ALLOWED_QSP_REDIRECT_HOSTS;
  const entries = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  const valid: string[] = [];
  for (const entry of entries) {
    if (HOSTNAME_PATTERN.test(entry)) {
      valid.push(entry);
    } else {
      console.warn(
        "[auto-login] AUTO_LOGIN_ALLOWED_REDIRECT_HOSTS 비정상 entry 무시:",
        { entry },
      );
    }
  }
  if (valid.length === 0) return DEFAULT_ALLOWED_QSP_REDIRECT_HOSTS;
  return valid;
}

// ASCII hostname(FQDN) 정확 일치만 허용. IDN/Punycode 는 검증 패턴 불일치로 자연 차단됨.
function isAllowedQspRedirectUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = getAllowedQspRedirectHosts();
    return allowedHosts.includes(host);
  } catch (error: unknown) {
    console.warn("[auto-login] QSP redirect URL 파싱 실패:", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * QSP autoLoginEncryptData 응답.
 * - resultCode: QSP 공통 응답 메타. **required** — 누락 시 계약 위반으로 간주하여 502.
 * - data.userId: 암호문(non-empty)
 * - data.url: 이동 base URL (HANASYS용) — URL 형식만 검증, host allowlist는 후속 단계에서 별도 검증
 *
 * host allowlist 를 `.refine` 으로 묶지 않는 이유:
 *   스키마 실패 로그가 "스키마 불일치"로 뭉개져 실제 원인 구분 불가.
 *   URL 형식 실패 / host 거부 / userId 누락 등을 별도 분기로 로깅하여 운영 가시성 확보.
 *
 * `z.string().url()` 은 `javascript:` scheme 도 통과시키므로 `.refine` 으로 https 로 1차 방어.
 * (후속 isAllowedQspRedirectUrl 에서 protocol 재검사하므로 방어 심도 유지용.)
 */
const qspEncryptResponseSchema = z.object({
  resultCode: z.number().int(),
  resultMessage: z.string().optional(),
  data: z.object({
    userId: z.string().min(1, "暗号文が空です"),
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), {
        message: "https scheme required",
      }),
  }),
});

/**
 * userId 형식 가드 — middleware 통과 header 지만 defense-in-depth.
 * 하위주소 이메일(`user+tag@example.com`)을 쓰는 GENERAL 회원이 차단되지 않도록 `+` 포함.
 */
const USER_ID_PATTERN = /^[A-Za-z0-9@._+\-]{1,128}$/;

/**
 * 502 응답 식별자 — 운영/QA 가 원인 구분 가능하도록 code 필드로 분리.
 * OpenAPI(`ErrorResponse`) 와 enum 동기화 유지.
 */
const UPSTREAM_CODES = {
  TIMEOUT: "UPSTREAM_TIMEOUT",
  HTTP_ERROR: "UPSTREAM_HTTP_ERROR",
  RESPONSE_PARSE_FAIL: "UPSTREAM_RESPONSE_PARSE_FAIL",
  SCHEMA_MISMATCH: "UPSTREAM_SCHEMA_MISMATCH",
  RESULT_FAIL: "UPSTREAM_RESULT_FAIL",
  REDIRECT_BLOCKED: "UPSTREAM_REDIRECT_BLOCKED",
  ASSEMBLY_FAIL: "UPSTREAM_ASSEMBLY_FAIL",
} as const;

type UpstreamCode = (typeof UPSTREAM_CODES)[keyof typeof UPSTREAM_CODES];

function upstreamError(code: UpstreamCode, message: string) {
  return NextResponse.json({ error: message, code }, { status: 502 });
}

/** QSP resultMessage / fetch error.message 에 SQL·내부 스택·userId 유출 방지 */
const MAX_UPSTREAM_MSG_LEN = 200;
function sanitizeUpstreamMessage(raw: string | undefined, userId: string): string | undefined {
  if (!raw) return raw;
  let replaced = raw;
  if (userId) {
    // 원문 + URL-encoded 형태 모두 치환 (fetch error 메시지가 URL 을 포함하는 경우 대비).
    replaced = replaced.split(userId).join("<userId>");
    const encoded = encodeURIComponent(userId);
    if (encoded !== userId) {
      replaced = replaced.split(encoded).join("<userId>");
    }
  }
  return replaced.length > MAX_UPSTREAM_MSG_LEN
    ? replaced.slice(0, MAX_UPSTREAM_MSG_LEN) + "...[truncated]"
    : replaced;
}

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
    // defense-in-depth — middleware 우회 시나리오 대비 userId 형식 가드.
    // QSP GET query / AES 암호화 입력 양쪽에 쓰이므로 syntax 위해(주입)·예상 외 길이·제어문자 차단.
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
        // 외부 API 프록시 — 응답 캐시 금지. 호출 지점에서 의도 명시.
        cache: "no-store",
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
    // fetch error 메시지에 URL(userId 쿼리 포함)/스택이 들어올 수 있음 → userId 치환 + truncate.
    const rawMsg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/auth/auto-login/encrypt] QSP 암호화 API 호출 실패:", {
      errorMessage: sanitizeUpstreamMessage(rawMsg, userId),
    });
    return upstreamError(UPSTREAM_CODES.TIMEOUT, "暗号化サーバーに接続できません");
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 비정상 응답:", qspResponse.status);
    return upstreamError(UPSTREAM_CODES.HTTP_ERROR, "暗号化サーバーエラーが発生しました");
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 파싱 실패:", error);
    return upstreamError(
      UPSTREAM_CODES.RESPONSE_PARSE_FAIL,
      "暗号化サーバーの応答を処理できません",
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
    return upstreamError(
      UPSTREAM_CODES.SCHEMA_MISMATCH,
      "暗号化サーバーの応答形式が正しくありません",
    );
  }

  // QSP 계약상 성공은 resultCode=200. required 로 올려 누락 = 계약 위반으로 502.
  if (parsed.data.resultCode !== 200) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP resultCode 비정상:", {
      resultCode: parsed.data.resultCode,
      // resultMessage 에 QSP 내부 SQL/스택이 유입될 수 있음 → truncate + userId 치환.
      resultMessage: sanitizeUpstreamMessage(parsed.data.resultMessage, userId),
    });
    return upstreamError(UPSTREAM_CODES.RESULT_FAIL, "暗号化サーバーの応答に失敗しました");
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
    return upstreamError(
      UPSTREAM_CODES.REDIRECT_BLOCKED,
      "リダイレクト先が許可されていません",
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
    return upstreamError(
      UPSTREAM_CODES.ASSEMBLY_FAIL,
      "リダイレクトURLの生成に失敗しました",
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
