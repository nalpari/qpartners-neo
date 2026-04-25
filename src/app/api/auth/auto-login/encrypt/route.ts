import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTO_LOGIN_URL, QSP_API } from "@/lib/config";
import { ConfigError } from "@/lib/errors";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import {
  encryptRequestSchema,
  UPSTREAM_CODES,
  type EncryptErrorResponse,
  type EncryptResponse,
  type UpstreamCode,
} from "@/lib/schemas/auto-login";

/**
 * QSP autoLoginEncryptData **서버 내부** 응답 파싱 스키마.
 *
 * ※ 이 스키마는 route.ts 내부에서만 사용하며 export 하지 않는다.
 *   프론트에 반환하는 응답 스키마는 `@/lib/schemas/auto-login`의 `encryptResponseSchema` 참조.
 *
 * 3사 통합 구조(2026-04-25 정정): QSP 는 userId 에만 의존하여 16B cipher 를 발급한다.
 * 같은 유저는 DESIGN/Q.Order/Q.Musubi 에 동일 cipher 를 사용. Q.Partners 는 target 별 URL 에
 * cipher 를 붙여 반환할 뿐 이므로 QSP 응답의 `data.url` 은 참조하지 않는다.
 *
 * - resultCode: 200 이외는 502
 * - data.userId: base64 cipher (필수, non-empty)
 *
 * NOTE: QSP 가 함께 반환하는 `data.url` 은 의도적으로 schema 에서 제외.
 * 미래 누군가 "QSP 가 url 도 주니 그대로 쓰자" 패턴으로 부활시킬 때
 * `javascript:` / `data:` 스킴 유입으로 Open Redirect / 저장형 XSS 위험.
 * 사용 필요 시 `.refine((u) => u.startsWith("https://"))` + host 화이트리스트 부활 필수.
 */
// DIAG: 2026-04-25 진단용 — PR revert 예정.
// data.url 을 스키마에 포함시켜 진단 로그에 노출. 보안상 사용은 여전히 금지(아래 참조).
// 정식 채택 시 url 사용 가드(.refine HTTPS + host allowlist) 함께 부활 필요.
const qspEncryptResponseSchema = z.object({
  resultCode: z.number().int(),
  resultMessage: z.string().optional(),
  data: z.object({
    userId: z.string().min(1, "暗号文が空です"),
    // DIAG: 2026-04-25 — 진단 로깅 전용. 사용 금지(open-redirect/XSS 위험은 위 주석 그대로).
    url: z.string().optional(),
  }),
});

/** userId 형식 가드 — middleware 통과 header 지만 defense-in-depth. `+` 포함(하위주소 이메일 지원). */
const USER_ID_PATTERN = /^[A-Za-z0-9@._+\-]{1,128}$/;

function upstreamError(
  code: UpstreamCode,
  message: string,
): NextResponse<EncryptErrorResponse> {
  return NextResponse.json({ error: message, code }, { status: 502 });
}

/** QSP resultMessage / fetch error.message 에 SQL·내부 스택·userId 유출 방지 */
const MAX_UPSTREAM_MSG_LEN = 200;
function sanitizeUpstreamMessage(raw: string | undefined, userId: string): string | undefined {
  if (!raw) return raw;
  let replaced = raw;
  if (userId) {
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

// POST /api/auth/auto-login/encrypt — 자동로그인 암호화 URL 생성
//
// 3사(HANASYS/Q.Order/Q.Musubi) 통합 구조:
//   1. QSP autoLoginEncryptData API 호출 (target 무관, userId 만 전달)
//   2. QSP 가 16B cipher 발급
//   3. Q.Partners 가 target 별 URL(`AUTO_LOGIN_URL`)에 cipher 를 붙여 프론트에 반환
//
// QSP 응답의 `data.url` 은 HANASYS 한정 힌트이므로 사용하지 않는다.
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
    // QSP GET query 에 들어가므로 syntax 위해(주입)·예상 외 길이·제어문자 차단.
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

    // DIAG: 2026-04-25 진단용 — PR revert 예정.
    console.info("[POST /api/auth/auto-login/encrypt][diag] phase=request", {
      target,
      userIdMasked: maskUserId(userId),
      userIdLength: userId.length,
    });

    // 3. QSP 에서 cipher 발급 (target 무관)
    const cipherResult = await fetchQspCipher(userId, target);
    if ("error" in cipherResult) {
      return cipherResult.error;
    }
    const { cipher } = cipherResult;

    // 4. target 별 URL 에 cipher 를 붙여 반환
    const baseUrl = AUTO_LOGIN_URL[target];
    let redirectUrl: string;
    try {
      const u = new URL(baseUrl);
      u.searchParams.set("autoLoginParam1", cipher);
      redirectUrl = u.toString();
      // DIAG: 2026-04-25 진단용 — PR revert 예정.
      console.info("[POST /api/auth/auto-login/encrypt][diag] phase=assemble", {
        target,
        baseUrl,
        redirectHost: u.host,
        redirectPath: u.pathname,
        cipherB64Length: cipher.length,
      });
    } catch (error: unknown) {
      console.error("[POST /api/auth/auto-login/encrypt] redirect URL 조립 실패:", {
        target,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return upstreamError(
        UPSTREAM_CODES.ASSEMBLY_FAIL,
        "リダイレクトURLの生成に失敗しました",
      );
    }

    // DIAG: 2026-04-25 진단용 — PR revert 예정.
    // 최종 redirect URL 의 cipher 부분만 *** 마스킹하여 노출.
    const redirectUrlForLog = redirectUrl.replace(
      /(autoLoginParam1=)[^&]+/,
      "$1***",
    );
    console.info("[POST /api/auth/auto-login/encrypt][diag] phase=respond", {
      target,
      status: 200,
      redirectUrlMasked: redirectUrlForLog,
    });

    return NextResponse.json<EncryptResponse>({ data: { url: redirectUrl } });
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

/**
 * QSP autoLoginEncryptData 호출해 16B cipher 만 추출.
 * 성공 시 { cipher }, 실패 시 { error: NextResponse } 반환 (route 상위에서 그대로 반환).
 *
 * DIAG: 2026-04-25 진단용 — `target` 파라미터는 진단 로그 라벨링 전용. 호출 query 변경 없음.
 */
async function fetchQspCipher(
  userId: string,
  target: string,
): Promise<{ cipher: string } | { error: NextResponse }> {
  const qspUrl = `${QSP_API.autoLoginEncrypt}?autoLoginParam1=${encodeURIComponent(userId)}`;
  // DIAG: 2026-04-25 진단용 — PR revert 예정.
  try {
    const parsedUrl = new URL(qspUrl);
    console.info("[POST /api/auth/auto-login/encrypt][diag] phase=qsp-call", {
      target,
      qspHost: parsedUrl.host,
      qspPath: parsedUrl.pathname,
      queryKeys: Array.from(parsedUrl.searchParams.keys()),
    });
  } catch {
    // URL 파싱 실패는 진단 로그 부수효과라 본 흐름 영향 없음
  }

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      qspUrl,
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
        // QSP 응답의 `data.userId` 가 base64 cipher (3사 자동로그인 진입 토큰).
        // SENSITIVE_KEYS 키 단위 마스킹으로는 잡히지 않으므로 본문 전체 마스킹.
        // cipher 가 qp_interface_log 에 평문 잔존 → DB 덤프 / 운영자 조회로 자정 경계까지 replay 가능.
        // (DIAG: 2026-04-25 — interface-logger 가 4xx/5xx 응답은 본문 노출하도록 임시 변경됨)
        maskResponseBody: true,
      },
    );
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/auth/auto-login/encrypt] QSP 암호화 API 호출 실패:", {
      errorMessage: sanitizeUpstreamMessage(rawMsg, userId),
    });
    return { error: upstreamError(UPSTREAM_CODES.TIMEOUT, "暗号化サーバーに接続できません") };
  }

  // DIAG: 2026-04-25 진단용 — PR revert 예정.
  const diagContentType = qspResponse.headers.get("content-type");
  if (!qspResponse.ok) {
    // DIAG: 2026-04-25 — 4xx/5xx 응답 본문도 진단 로그에 남겨 차단 사유 직접 확인.
    let diagErrorBodyPrefix: string | null = null;
    try {
      const errorBody = await qspResponse.clone().text();
      diagErrorBodyPrefix = errorBody.slice(0, 500);
    } catch {
      // 본문 읽기 실패는 부수 정보 — 본 흐름 영향 없음
    }
    console.error("[POST /api/auth/auto-login/encrypt][diag] phase=qsp-resp", {
      target,
      status: qspResponse.status,
      contentType: diagContentType,
      bodyPrefix: diagErrorBodyPrefix,
    });
    return {
      error: upstreamError(UPSTREAM_CODES.HTTP_ERROR, "暗号化サーバーエラーが発生しました"),
    };
  }

  // HTML/비-JSON 응답 대비 — text 로 먼저 받은 뒤 JSON.parse 시도.
  // 실패 시 contentType/bodyPrefix 를 로그에 남겨 즉시 원인 판단 가능하게 한다.
  const contentType = qspResponse.headers.get("content-type");
  let bodyText: string;
  try {
    bodyText = await qspResponse.text();
  } catch (error) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 body 읽기 실패:", error);
    return {
      error: upstreamError(
        UPSTREAM_CODES.RESPONSE_PARSE_FAIL,
        "暗号化サーバーの応答を処理できません",
      ),
    };
  }

  let qspBody: unknown;
  try {
    qspBody = JSON.parse(bodyText);
  } catch (error) {
    // Content-Type 이 JSON 계열이면 부분 성공(malformed JSON)일 때 cipher·resultMessage 등
    // 민감 필드가 prefix 에 포함될 수 있으므로 원문 대신 메타 정보만 로깅.
    // HTML/plain 등 비-JSON 응답(에러 페이지·프록시 리다이렉트 등)은 cipher 포함 가능성이 낮고
    // 운영 진단에 실제 본문 prefix 가 유용하므로 slice 노출.
    const isJsonLike = contentType?.toLowerCase().includes("json") ?? false;
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 JSON 파싱 실패:", {
      errorMessage: error instanceof Error ? error.message : String(error),
      contentType,
      bodyLength: bodyText.length,
      bodyPrefix: isJsonLike ? "[masked:json-like]" : bodyText.slice(0, 200),
    });
    return {
      error: upstreamError(
        UPSTREAM_CODES.RESPONSE_PARSE_FAIL,
        "暗号化サーバーの応答を処理できません",
      ),
    };
  }

  const parsed = qspEncryptResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    const responseBodyShape =
      qspBody != null && typeof qspBody === "object"
        ? Object.keys(qspBody as Record<string, unknown>)
        : typeof qspBody;
    console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 스키마 불일치:", {
      issues: parsed.error.issues,
      responseBodyShape,
    });
    return {
      error: upstreamError(
        UPSTREAM_CODES.SCHEMA_MISMATCH,
        "暗号化サーバーの応答形式が正しくありません",
      ),
    };
  }

  if (parsed.data.resultCode !== 200) {
    console.error("[POST /api/auth/auto-login/encrypt] QSP resultCode 비정상:", {
      resultCode: parsed.data.resultCode,
      resultMessage: sanitizeUpstreamMessage(parsed.data.resultMessage, userId),
    });
    return {
      error: upstreamError(UPSTREAM_CODES.RESULT_FAIL, "暗号化サーバーの応答に失敗しました"),
    };
  }

  // DIAG: 2026-04-25 진단용 — PR revert 예정.
  // 가설 (α) vs (β) 판별의 결정타: cipher 길이 + data.url + content-type.
  // 같은 사용자로 hanasys/qOrder/qMusubi 3회 호출 결과를 비교하면 QSP 가 호출 컨텍스트별로
  // 다른 응답을 주는지(α) 동일 응답을 주는지(β) 확인 가능.
  const cipherB64 = parsed.data.data.userId;
  let cipherByteLength: number | null = null;
  try {
    cipherByteLength = Buffer.from(cipherB64, "base64").length;
  } catch {
    // base64 파싱 실패는 진단 로그 부수효과
  }
  console.info("[POST /api/auth/auto-login/encrypt][diag] phase=qsp-resp", {
    target,
    status: qspResponse.status,
    contentType: diagContentType,
    resultCode: parsed.data.resultCode,
    resultMessage: sanitizeUpstreamMessage(parsed.data.resultMessage, userId),
    cipherB64Length: cipherB64.length,
    cipherByteLength,
    dataUrl: parsed.data.data.url ?? null,
  });

  return { cipher: cipherB64 };
}
