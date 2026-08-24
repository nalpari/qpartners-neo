/**
 * AS-IS Q.Partners(시공점/SEKO) Connector API 클라이언트.
 *
 * QSP 연동(`qsp-member.ts`) 패턴을 그대로 미러링한다:
 *  - framework-agnostic: NextResponse 를 반환하지 않고 `{ ok }` 결과 객체 반환 → 호출부에서 HTTP 변환
 *  - `fetchWithLog` 로 `qp_interface_log` 자동 기록 (system: "SEKO")
 *  - 응답은 Zod `safeParse` — 스키마 불일치/파싱 실패 시 502
 *
 * 인증 2종 (사양서 + 2026-08-07 스모크 확인):
 *  - **Bearer**: login 응답 token(24h) 을 Authorization 헤더로 전달
 *  - **X-Api-Key**: 서버 고정키
 *
 * SEKO 는 인증/검증 실패도 **HTTP 400 + result.resultCode="E" + errorCode** 로 응답하므로,
 * `!response.ok` 만으로 502 처리하지 않고 본문을 파싱해 errorCode 를 추출한다(QSP 와 다른 점).
 *
 * 접속정보(base URL)는 환경변수 주입 — 미설정 시 **호출 시점** ConfigError.
 * (부팅은 막지 않음 — SEKO 미사용 환경 고려. 환경별 값은 .env 로 주입, 코드 하드코딩 금지.)
 *
 * 현재 구현: No.1 Auto Login / No.2 Login / No.3 User Info / No.4 User Info Update /
 * No.5 File Download / No.6 Password Change / No.7 User List / No.8 Email Check /
 * No.9 2FA Save / No.10 Password Reset — 사양서 10 API 전부.
 */

import { ConfigError } from "@/lib/errors";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import { jstNextDayStart } from "@/lib/jst-day";
import {
  sekoAutoLoginResponseSchema,
  sekoEmailCheckResponseSchema,
  sekoFileDownloadResponseSchema,
  sekoLoginResponseSchema,
  sekoNoDataResponseSchema,
  sekoUserInfoResponseSchema,
  sekoUserListItemSchema,
  sekoUserListResponseSchema,
  type SekoEmailCheckData,
  type SekoLoginData,
  type SekoUserInfoData,
  type SekoUserListItem,
} from "@/lib/schemas/seko";

export type SekoFetchError = {
  error: string;
  status: number;
  /** SEKO result.errorCode — 화면분기(비번만료/미초기화 등) 처리용. 호출부에서 사용. */
  errorCode?: string;
};

/**
 * `sekoResetPwd` 전용 결과 타입 — 실패 시 **처리 여부가 확정인지**를 함께 돌려준다.
 *
 * 호출부(`password-reset/confirm`)가 일회용 토큰을 롤백할지 판단하는 유일한 근거다.
 * - `indeterminate: false` — Connector 가 명시적으로 거부(`resultCode !== "S"`). 비밀번호가
 *   바뀌지 않았음이 확정이므로 토큰을 되살려 재시도를 허용해도 안전하다.
 * - `indeterminate: true` — 타임아웃·응답 파싱 실패·스키마 불일치. Connector 가 비밀번호를 이미
 *   바꾼 뒤 응답만 유실됐을 수 있다. 이때 토큰을 되살리면 "재설정은 성공했는데 링크는 다시
 *   쓸 수 있는" 상태가 되어 일회용 불변식이 깨진다 — 호출부는 토큰을 소비 상태로 유지한다.
 *
 * 다른 Connector 함수는 이 구분이 필요 없다(조회이거나, 호출부가 토큰을 다루지 않는다).
 */
export type SekoResetPwdResult =
  | { ok: true }
  | { ok: false; error: SekoFetchError; indeterminate: boolean };

const SEKO_TIMEOUT_MS = 10_000;
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * 재로그인이 필요한 인증 실패 errorCode (2026-08-13 preview 실측).
 *  - `NO_AUTHENTICATION_ERROR`: Authorization 헤더 누락
 *  - `AUTHENTICATION_ERROR`: 토큰 무효/만료 (Bearer 24h 경과 포함)
 * 둘 다 401 로 매핑해 세션 만료 안내·재로그인 유도로 이어지게 한다.
 * (한쪽만 처리하면 토큰 만료가 502/400 으로 나가 사용자가 원인을 알 수 없다.)
 */
const SEKO_AUTH_ERROR_CODES: ReadonlySet<string> = new Set([
  "NO_AUTHENTICATION_ERROR",
  "AUTHENTICATION_ERROR",
]);

function isSekoAuthError(errorCode: string | null | undefined): boolean {
  return errorCode != null && SEKO_AUTH_ERROR_CODES.has(errorCode);
}

/**
 * SEKO 실패 → TO-BE HTTP status 매핑 (Bearer 계열 공통).
 *  - 인증 실패(헤더 누락·토큰 만료) → 401 (재로그인 유도)
 *  - 커넥터/인프라 5xx            → 502 (외부 장애)
 *  - 그 외 비즈니스 거부           → 400 (호출측 입력 문제)
 *
 * SEKO 는 비즈니스 거부도 HTTP 400 + resultCode="E" 로 응답한다. 이를 502 로 접으면
 * 사용자는 영구적 거부에 대해 "しばらくしてからお試しください" 안내를 받아 무한 재시도하고,
 * 운영은 우리 쪽 입력 오류를 외부 장애 알람으로 계상한다.
 * (login 은 사용자 열거 방지를 위해 자격증명 거부를 401 로 고정 — 이 헬퍼를 쓰지 않는다.)
 */
function mapSekoFailureStatus(
  httpStatus: number,
  errorCode: string | null | undefined,
): number {
  if (isSekoAuthError(errorCode)) return 401;
  // errorCode 없는 HTTP 401 = 게이트웨이/프록시가 돌려준 인증 실패. 이걸 400 으로 접으면
  // 호출부의 세션 종료 분기가 발동하지 않아 죽은 Bearer 를 담은 세션이 그대로 유지된다.
  //
  // 반대로 errorCode 가 실린 401 은 커넥터가 판단한 **비즈니스 거부**이므로 401 로 올리지
  // 않는다. changePwd(chgType=C) 는 현재 비밀번호를 검증하는데, 이를 401 로 접으면 오타 한 번에
  // 세션이 종료된다(호출부가 401 → sessionInvalidResponse). 인증 실패는 위 화이트리스트로만 판정.
  if (httpStatus === 401 && errorCode == null) return 401;
  if (httpStatus >= 500) return 502;
  return 400;
}

/** SEKO Connector base URL (env `SEKO_CONNECTOR_BASE_URL`). 끝 슬래시 제거. */
function sekoBaseUrl(): string {
  const url = process.env.SEKO_CONNECTOR_BASE_URL?.trim();
  if (!url) {
    throw new ConfigError(
      "SEKO_CONNECTOR_BASE_URL is not set (시공점 Connector base URL 미설정)",
    );
  }
  // 비밀번호 평문 전송(login/changePwd 등) 보호 — 운영에서는 HTTPS 강제(dev http 허용).
  // config.ts 의 QSP_BASE_URL HTTPS 가드와 동일 정책(APP_ENV=production 기준).
  if (process.env.APP_ENV === "production" && !url.startsWith("https://")) {
    throw new ConfigError(
      "SEKO_CONNECTOR_BASE_URL must use HTTPS in production (시공점 Connector 비밀번호 평문 전송 보호)",
    );
  }
  return url.replace(/\/+$/, "");
}

function sekoEndpoint(path: string): string {
  return `${sekoBaseUrl()}${path}`;
}

/**
 * AS-IS **사이트 화면** 절대 URL. 커넥터 API 와 같은 호스트를 쓴다.
 *
 * 자동로그인(No.1) 이 심는 세션 쿠키는 그 호스트에만 유효하므로, 이동 대상도 반드시 같은
 * 호스트여야 한다. 화면 URL 을 코드에 하드코딩하면 preview 에서 자동로그인은 preview 에
 * 걸리고 이동만 운영으로 나가 **비로그인 상태로 도착**한다 — 환경별 값은 env 하나
 * (`SEKO_CONNECTOR_BASE_URL`)에서 파생시킨다.
 */
export function sekoSiteUrl(path: string): string {
  return `${sekoBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * AS-IS 가 돌려준 URL 을 **커넥터 origin 안쪽 절대 URL** 로 해석한다. 밖이면 `null`.
 *
 * 커넥터 응답에 실려 오는 URL 두 곳(`No.1 autologinUrl`, `No.5 fileUrl`)이 공유한다.
 * 무검증으로 쓰면 성격은 다르지만 뿌리가 같은 사고가 난다:
 *  - `fileUrl` — 서버가 임의 호스트로 Bearer 를 들고 나가 응답을 사용자에게 흘리는 SSRF 프록시
 *  - `autologinUrl` — 사용자를 임의 사이트로 보내는 열린 리다이렉터
 * 게다가 절대 URL 을 그냥 쓰면 `sekoBaseUrl()` 의 운영 HTTPS 강제 가드를 통째로 우회한다.
 *
 * 순수 함수로 둔 이유: origin 판정은 수동 재현이 사실상 불가능한데(커넥터가 악성 URL 을 돌려줘야
 * 한다) 상대경로 처리 한 줄만 바뀌어도 조용히 뚫린다. 입출력만 보는 형태여야 검증할 수 있다.
 *
 * 차단 케이스: origin 불일치 / 스킴 다운그레이드(`http://`) / userinfo 위조(`https://host@evil.com`)
 * / 프로토콜 상대(`//evil.com`) / 백슬래시(`\evil.com`) / URL 파싱 실패 / 빈 값.
 */
export function resolveSekoUrl(baseUrl: string, rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === "/") return null;

  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    // base URL 자체가 깨진 설정 — 호출부가 502 로 접는다(ConfigError 로 올리지 않는 이유는
    // 이 함수가 순수 함수이기 때문. 설정 검증은 sekoBaseUrl() 의 몫).
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const candidate = new URL(trimmed);
      // origin 비교는 scheme+host+port 를 함께 본다 — http 다운그레이드도 여기서 걸린다.
      if (candidate.origin !== baseOrigin) return null;
      return candidate.toString();
    } catch {
      return null;
    }
  }

  // 스킴 없는 호스트 지정 표기. 상대경로로 취급하면 base 뒤에 붙어 무해하지만,
  // 정상 응답에는 나올 수 없는 형태라 명시적으로 거부해 의도를 드러낸다.
  if (trimmed.startsWith("//") || trimmed.startsWith("\\")) return null;

  return `${baseUrl}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

/**
 * X-Api-Key 계열 API 용 서버 고정키 (env `SEKO_API_KEY`).
 * Bearer 계열과 달리 로그인 세션이 없는 상태(비밀번호 분실 등)에서 호출하므로 서버 키를 쓴다.
 */
function sekoApiKeyHeader(): { "X-Api-Key": string } {
  const key = process.env.SEKO_API_KEY?.trim();
  if (!key) {
    throw new ConfigError(
      "SEKO_API_KEY is not set (시공점 Connector X-Api-Key 미설정)",
    );
  }
  return { "X-Api-Key": key };
}

/**
 * No.1 Seko Auto Login API — 시공점 자동로그인 URL 발급 (Bearer, **아웃바운드**).
 *
 * TO-BE 에 로그인한 시공점 회원을 AS-IS Q.Partners 로 **로그인된 채 내보내기** 위한 일회용 링크를
 * 받는다. 반환된 URL 로 브라우저를 보내면 AS-IS 가 세션 쿠키를 심고 자기 사이트로 리다이렉트한다.
 *
 * 주의 2가지 (2026-08-20 preview 실측):
 *  - **착지는 항상 AS-IS 루트**다. 화면 지정 수단이 현재 없다(ENDO 질의 중).
 *  - **1회·1분 유효**다. 호출부는 링크를 미리 만들어 두거나 `<a href>` 로 노출하면 안 된다 —
 *    브라우저·프레임워크 프리페치가 조용히 소진시켜 사용자가 만료 안내를 보게 된다.
 */
export async function sekoAutoLogin(
  userId: string,
  token: string,
  logTag: string,
): Promise<
  | { ok: true; autologinUrl: string }
  | { ok: false; error: SekoFetchError }
> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/autologin"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "autologin",
        callerRoute: logTag,
        userId: maskUserId(userId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 자동로그인 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  // 상태 판정을 본문 파싱보다 **앞**에 둔다(sekoFileDownload·sekoSave2faVerified 와 동일 패턴).
  // 401 인데 본문이 비었거나 HTML(프록시/게이트웨이 응답)이면 아래 파싱·스키마 단계에서 502 로
  // 접혀, 라우트의 401 세션 종료 분기가 영영 발동하지 않는다 — 죽은 Bearer 세션이 그대로 남고
  // 로컬 JWT 는 유효해 재로그인 유도 없이 모든 SEKO 호출이 반복 실패한다.
  if (response.status === 401) {
    console.warn(`${logTag} SEKO 자동로그인 인증 실패 (HTTP 401) — 세션 종료 대상`);
    return { ok: false, error: { error: "自動ログインに失敗しました", status: 401 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(
      `${logTag} SEKO 자동로그인 응답 파싱 실패 (status: ${response.status}):`,
      error,
    );
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoAutoLoginResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 자동로그인 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    console.warn(
      `${logTag} SEKO 자동로그인 발급 실패 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    const status = mapSekoFailureStatus(response.status, result.errorCode);
    return {
      ok: false,
      error: {
        error: "自動ログインに失敗しました",
        status,
        errorCode: result.errorCode ?? undefined,
      },
    };
  }

  // 발급된 URL 은 그대로 브라우저에 넘길 값이다. 커넥터 origin 밖 주소가 오면
  // 열린 리다이렉터가 되므로(사용자를 임의 사이트로 보냄) origin 을 검증한다.
  // 상대경로는 커넥터 base 를 붙여 절대 URL 로 만든다 (No.5 fileUrl 처리와 같은 정책).
  const resolved = resolveSekoUrl(sekoBaseUrl(), data.autologinUrl);
  if (!resolved) {
    console.error(
      `${logTag} SEKO autologinUrl 이 커넥터 origin 밖 — 사용자 리다이렉트 중단`,
    );
    return { ok: false, error: { error: "自動ログインに失敗しました", status: 502 } };
  }

  return { ok: true, autologinUrl: resolved };
}

/**
 * No.2 Seko Login API — 시공점 ID/PW 로그인.
 * 성공 시 Bearer 토큰(24h) + 회원정보 반환. 이후 Bearer 계열 API 에 token 을 전달한다.
 */
export async function sekoLogin(
  loginId: string,
  pwd: string,
  logTag: string,
): Promise<
  | { ok: true; data: SekoLoginData }
  | { ok: false; error: SekoFetchError }
> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/login"),
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ loginId, pwd }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "login",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 로그인 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 로그인 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoLoginResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 로그인 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    // 비즈니스 거부(자격증명 오류 `INVALID_LOGIN_ID_OR_PASSWORD_ERROR`·비번 미초기화
    // `PASSWORD_INIT_REQUIRED_ERROR` 등)는 문서화된 HTTP 400.
    // 5xx(인프라 장애)는 자격오류로 뭉개지 않고 502 로 분리(코드리뷰 I1 반영).
    console.warn(
      `${logTag} SEKO 로그인 거부 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    const status = response.status >= 500 ? 502 : 401;
    return {
      ok: false,
      error: { error: "ログインに失敗しました", status, errorCode: result.errorCode ?? undefined },
    };
  }

  return { ok: true, data };
}

/**
 * No.3 Seko User Info API — 시공점 회원정보 조회 (Bearer).
 * login 응답 token 을 Authorization 헤더로 전달한다. loginId=email(사양).
 */
export async function sekoGetUserInfo(
  loginId: string,
  token: string,
  logTag: string,
): Promise<
  | { ok: true; data: SekoUserInfoData }
  | { ok: false; error: SekoFetchError }
> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/getUserInfo"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ loginId }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "getUserInfo",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 회원정보 조회 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 회원정보 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoUserInfoResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 회원정보 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    console.warn(
      `${logTag} SEKO 회원정보 조회 실패 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    const status = mapSekoFailureStatus(response.status, result.errorCode);
    return {
      ok: false,
      error: { error: "会員情報を照会できません", status, errorCode: result.errorCode ?? undefined },
    };
  }

  return { ok: true, data };
}

/**
 * No.4 Seko User Info Update API — 시공점 회원정보 수정 (Bearer).
 * TO-BE 에서는 **newsRcptYn(뉴스 수신 여부)만** 갱신한다 (QA#8 — 회사정보 갱신 화면 없음).
 */
export async function sekoUpdateUserInfo(
  userId: string,
  loginId: string,
  newsRcptYn: "Y" | "N",
  token: string,
  logTag: string,
): Promise<{ ok: true } | { ok: false; error: SekoFetchError }> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/updateUserInfo"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, loginId, newsRcptYn }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "updateUserInfo",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 회원정보 수정 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 회원정보 수정 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoNoDataResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 회원정보 수정 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { result } = parsed.data;
  if (result.resultCode !== "S") {
    console.warn(
      `${logTag} SEKO 회원정보 수정 실패 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    const status = mapSekoFailureStatus(response.status, result.errorCode);
    return {
      ok: false,
      error: { error: "会員情報の修正に失敗しました", status, errorCode: result.errorCode ?? undefined },
    };
  }

  return { ok: true };
}

/**
 * No.5 Seko File Download API — 시공점 첨부파일 다운로드 (Bearer, **2단계**).
 *
 *  1) `/api/seko/fileDownload` 로 메타(`fileUrl`·`fileName`·`contentType`) 획득
 *  2) `fileUrl` 을 Bearer 로 재fetch 하여 바이너리 확보 → 호출부(라우트)가 스트리밍 프록시
 *
 * `fileUrl` 은 Bearer 가 필요한 AS-IS 경로라 브라우저로 리다이렉트할 수 없다(토큰이 노출되고,
 * 노출해도 쿠키 도메인이 달라 붙지 않는다). TO-BE 서버가 대신 받아 내려주는 구조인 이유다.
 *
 * `userId` 와 `loginId` 는 **둘 다 필수**다 (2026-08-19 preview 실측 — 하나만 보내면 거부).
 */
export async function sekoFileDownload(
  params: { userId: string; loginId: string; fileType: string },
  token: string,
  logTag: string,
): Promise<
  | { ok: true; fileName: string; contentType: string; body: ArrayBuffer }
  | { ok: false; error: SekoFetchError }
> {
  // ── 1단계: fileUrl 메타 획득 ──
  // sekoId(특정 시공ID 증명서 지정)는 의도적으로 보내지 않는다. 세션 JWT 에 시공ID 가 없어
  // TO-BE 에서 소유권을 검증할 수단이 없고, AS-IS 가 userId 와 교차검증한다는 실측 근거도 없다.
  // 무검증 전달 시 타 시공점의 시공증명서를 받아갈 수 있으므로 userId·loginId 로만 특정한다.
  const reqBody = {
    userId: params.userId,
    loginId: params.loginId,
    fileType: params.fileType,
  };

  let metaResponse: Response;
  try {
    metaResponse = await fetchWithLog(
      sekoEndpoint("/api/seko/fileDownload"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify(reqBody),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "fileDownload",
        callerRoute: logTag,
        userId: maskUserId(params.loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 파일 메타 조회 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  // 상태 판정을 본문 파싱보다 **앞**에 둔다(sekoSave2faVerified 와 동일 패턴). 401 인데 본문이
  // 비었거나 HTML(프록시/게이트웨이 응답)이면 아래 파싱·스키마 단계에서 502 로 접혀,
  // 호출부의 401 세션 종료 분기가 영영 발동하지 않는다 — 죽은 Bearer 세션이 그대로 남는다.
  if (metaResponse.status === 401) {
    console.warn(`${logTag} SEKO 파일 메타 조회 인증 실패 (HTTP 401) — 세션 종료 대상`);
    return { ok: false, error: { error: "ファイルの取得に失敗しました", status: 401 } };
  }

  let metaBody: unknown;
  try {
    metaBody = await metaResponse.json();
  } catch (error: unknown) {
    console.error(
      `${logTag} SEKO 파일 메타 응답 파싱 실패 (status: ${metaResponse.status}):`,
      error,
    );
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoFileDownloadResponseSchema.safeParse(metaBody);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 파일 메타 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    console.warn(
      `${logTag} SEKO 파일 메타 조회 실패 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    // 인증 실패·외부 장애 판정은 공용 헬퍼에 위임한다. HTTP 401 은 위 선판정이 이미 흡수했으므로
    // 여기서 헬퍼가 잡는 건 (a) 비-401 응답에 인증 errorCode 가 실린 경우 → 401,
    // (b) 5xx → 502 두 가지다. 자체 매핑으로 대체하면 이 두 분기가 조용히 유실되어,
    // 죽은 Bearer 를 담은 세션이 404 안내만 반복하며 고착된다.
    //
    // 헬퍼가 남기는 400(비즈니스 거부)만 404 로 승격한다 — fileType 은 라우트에서 Zod 로
    // 이미 검증되므로 남는 거부는 사실상 "해당 문서가 아직 발급되지 않음" 이고,
    // 화면이 "ファイルが見つかりません" 안내를 띄우게 해야 한다.
    const mappedStatus = mapSekoFailureStatus(metaResponse.status, result.errorCode);
    const status = mappedStatus === 400 ? 404 : mappedStatus;
    return {
      ok: false,
      error: {
        error: status === 404 ? "ファイルが見つかりません" : "ファイルの取得に失敗しました",
        status,
        errorCode: result.errorCode ?? undefined,
      },
    };
  }

  // ── 2단계: fileUrl 바이너리 프록시 fetch (Bearer) ──
  // origin 검증은 `resolveSekoUrl` 로 위임한다 — No.1 autologinUrl 과 판정 규칙이 같아야 하고,
  // 보안 검사를 두 벌 두면 한쪽만 고쳐지는 순간 조용히 갈라진다.
  // 밖이면 토큰을 붙이지 않고 502 로 종료한다.
  const fileUrl = resolveSekoUrl(sekoBaseUrl(), data.fileUrl);
  if (!fileUrl) {
    console.error(`${logTag} SEKO fileUrl 이 커넥터 origin 밖 — Bearer 미부착 후 중단`);
    return { ok: false, error: { error: "ファイルの取得に失敗しました", status: 502 } };
  }

  let fileResponse: Response;
  try {
    fileResponse = await fetchWithLog(
      fileUrl,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        // origin 화이트리스트는 최초 1홉만 검사한다. follow 로 두면 커넥터가 302 로 임의 호스트를
        // 가리키는 순간 서버가 그리로 아웃바운드를 보내고 응답을 사용자에게 그대로 흘리는
        // SSRF 프록시가 되어 위 검증이 무력화된다. (cross-origin 리다이렉트에서 Authorization 이
        // 지워지는 건 undici 구현에 기댄 것이지 우리 방어가 아니다.)
        redirect: "manual",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        // 1단계와 같은 apiName 을 쓰면 qp_interface_log 에서 두 호출을 구분할 수 없다.
        apiName: "fileDownload:fetch",
        callerRoute: logTag,
        userId: maskUserId(params.loginId),
        userType: "SEKO",
        // 응답이 PDF/HTML 바이너리다. 본문을 로깅하면 파일 전체를 문자열로 디코드하고
        // JSON 파싱 실패 WARN 이 다운로드마다 쌓인다 — 호출 기록만 남기고 본문은 건너뛴다.
        skipResponseBody: true,
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 파일 바이너리 fetch 실패:`, error);
    return { ok: false, error: { error: "ファイルの取得に失敗しました", status: 502 } };
  }

  if (fileResponse.status >= 300 && fileResponse.status < 400) {
    console.error(
      `${logTag} SEKO 파일 바이너리 리다이렉트 거부 (status: ${fileResponse.status}) — origin 검증 우회 방지`,
    );
    return { ok: false, error: { error: "ファイルの取得に失敗しました", status: 502 } };
  }

  if (!fileResponse.ok) {
    console.error(`${logTag} SEKO 파일 바이너리 비정상 응답:`, fileResponse.status);
    const status = fileResponse.status === 401 ? 401 : 502;
    return { ok: false, error: { error: "ファイルの取得に失敗しました", status } };
  }

  let fileBody: ArrayBuffer;
  try {
    fileBody = await fileResponse.arrayBuffer();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 파일 바이너리 읽기 실패:`, error);
    return { ok: false, error: { error: "ファイルの取得に失敗しました", status: 502 } };
  }

  return {
    ok: true,
    fileName: data.fileName,
    // 메타의 contentType 우선, 없으면 실제 fetch 응답 헤더, 그래도 없으면 octet-stream.
    contentType:
      data.contentType ??
      fileResponse.headers.get("content-type") ??
      "application/octet-stream",
    body: fileBody,
  };
}

/**
 * No.6 Seko Password Change API — 시공점 비밀번호 변경 (Bearer).
 *
 * chgType 2종 (사양서 20260811):
 *  - `"I"` = 초기화 후 변경(최초 로그인 personal-info 팝업) — 현재 비밀번호 불요
 *  - `"C"` = 마이페이지 변경 — 현재 비밀번호(`pwd`) 필수
 *
 * 사양상 `pwd` 는 chgType=C 에서만 필수이므로, discriminated union 으로
 * 호출부의 누락을 컴파일 타임에 차단한다.
 */
export type SekoChangePwdInput =
  | { chgType: "I"; loginId: string; newPwd: string }
  | { chgType: "C"; loginId: string; currentPwd: string; newPwd: string };

/**
 * 요청 body 조립 — switch + never 소진 검사.
 *
 * 삼항 else 폴백으로 두면 union 에 3번째 chgType(No.10 resetPwd 등)이 추가돼도 컴파일러가
 * 막지 못하고, 그 케이스가 "초기화 변경(현재 비밀번호 불요)" 으로 전송된다.
 * 침묵하며 깨지는 방향이 보안 완화 쪽이므로 소진 검사로 차단한다.
 */
function buildChangePwdBody(input: SekoChangePwdInput): Record<string, string> {
  switch (input.chgType) {
    case "C":
      return {
        loginId: input.loginId,
        // 리터럴 재타이핑 금지 — discriminant 를 그대로 재사용한다.
        chgType: input.chgType,
        pwd: input.currentPwd,
        chgPwd: input.newPwd,
      };
    case "I":
      return { loginId: input.loginId, chgType: input.chgType, chgPwd: input.newPwd };
    default: {
      const exhaustive: never = input;
      throw new Error(`Unhandled SEKO chgType: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export async function sekoChangePwd(
  input: SekoChangePwdInput,
  token: string,
  logTag: string,
): Promise<{ ok: true } | { ok: false; error: SekoFetchError }> {
  const requestBody = buildChangePwdBody(input);

  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/changePwd"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify(requestBody),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "changePwd",
        callerRoute: logTag,
        userId: maskUserId(input.loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 비밀번호 변경 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 비밀번호 변경 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoNoDataResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 비밀번호 변경 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { result } = parsed.data;
  if (result.resultCode !== "S") {
    console.warn(
      `${logTag} SEKO 비밀번호 변경 실패 (chgType: ${input.chgType}, resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    const status = mapSekoFailureStatus(response.status, result.errorCode);
    return {
      ok: false,
      error: { error: "パスワード変更に失敗しました", status, errorCode: result.errorCode ?? undefined },
    };
  }

  return { ok: true };
}

// ─── No.9 Seko 2FA Save API ───

/** SEKO 날짜 포맷 — `YYYY-MM-DD HH:mm:ss` (시각 생략 허용). QSP 는 `.` 구분자라 파서를 공유할 수 없다. */
const SEKO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/;

/**
 * SEKO `secAuthDt` → ISO datetime(+09:00). 포맷 불일치·rollover 는 `null`.
 *
 * `parseQspDate` 의 안전장치를 구분자만 바꿔 미러링한다 — 정규식 통과 후에도 JST 성분을
 * cross-check 해 rollover(`2026-02-30` → 3/2, `25:00:00` → 익일 01:00)를 걸러낸다.
 *
 * ⚠️ `null` 은 호출부에서 **fail-closed(2FA 필요)** 로 처리해야 한다. 만료 판정 불가를
 * "최근 인증됨" 으로 접으면 2FA 가 조용히 무력화된다.
 * 원문은 로그에 남기지 않는다(길이만) — PII 회피 + 포맷 드리프트 감지용.
 */
export function parseSekoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = SEKO_DATE_RE.exec(trimmed);
  if (!match) {
    console.warn(`[parseSekoDate] SEKO 날짜 포맷 불일치 — drift 가능성, length=${trimmed.length}`);
    return null;
  }

  const [, yyyy, mm, dd, hh = "00", min = "00", ss = "00"] = match;
  const probe = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`);
  if (Number.isNaN(probe.getTime())) {
    console.warn(`[parseSekoDate] 유효하지 않은 날짜, length=${trimmed.length}`);
    return null;
  }
  // +09:00 으로 파싱한 UTC ms 에 9h 를 더해 UTC 로 읽으면 JST 성분이 된다 (Intl 비의존).
  const jst = new Date(probe.getTime() + 9 * 60 * 60 * 1000);
  if (
    jst.getUTCFullYear() !== Number(yyyy) ||
    jst.getUTCMonth() + 1 !== Number(mm) ||
    jst.getUTCDate() !== Number(dd) ||
    jst.getUTCHours() !== Number(hh) ||
    jst.getUTCMinutes() !== Number(min) ||
    jst.getUTCSeconds() !== Number(ss)
  ) {
    console.warn(`[parseSekoDate] rollover 감지 — length=${trimmed.length}`);
    return null;
  }

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`;
}

/**
 * 현재 시각 → SEKO 요청용 `YYYY-MM-DD HH:mm:ss` (JST).
 * ISO 문자열을 보내면 Connector 가 거부하므로 이 포맷을 강제한다(2026-08-18 실측).
 */
export function formatSekoDateTime(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}` +
    ` ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}`
  );
}

/**
 * `sekoStatus` 期限切れ — 사양서 `Seko User Info API` r27 (1=有効, 2=期限切れ).
 * `deltaStatus` 도 같은 코드계지만 델타ID 전용이라 로그인 게이트에서는 보지 않는다.
 */
const SEKO_ID_STATUS_EXPIRED = 2;

/** 시공ID 유효성 판정 결과 — 차단 시 사유를 남겨 운영 로그에서 원인을 구분한다. */
export type SekoIdValidity =
  | { valid: true; reason: "ACTIVE" | "NO_SEKO_ID" }
  | { valid: false; reason: "STATUS_EXPIRED" | "LIMIT_PASSED" | "UNPARSABLE_LIMIT" };

/**
 * 시공ID 유효성 판정 — 화면설계서 p10「만료된 시공ID로 로그인 시 로그인 불가」의 판정부.
 *
 * 사양서(20260817) `Seko User Info API` 기준:
 *  - `sekoStatus` r27 — 施工ID状態 (**1=有効, 2=期限切れ**)
 *  - `sekoLimit`  r29 — 施工ID有効期限 (`YYYY-MM-DD`)
 *
 * 두 값은 **login 응답에 없고 getUserInfo 에만 있다**(login 응답 15필드 확인). 그래서 호출부는
 * 로그인 직후 getUserInfo 를 한 번 더 친다 — 이 함수를 순수하게 뺀 이유는 만료 계정을 실측할
 * 수단이 없어(preview 테스트 계정이 유효기간 미래 1건뿐) 입출력으로만 검증 가능해서다.
 *
 * **`sekoLimit` 은 유효기간의 마지막 날을 포함**한다(`2026-12-31` → 12/31 종일 유효).
 * 따라서 만료 판정은 `now >= 만료일 다음날 00:00(JST)` 이다. 하루 차이로 유효한 시공ID 를
 * 막으면 사용자가 우회할 방법이 없다.
 *
 * **시공ID 미보유(두 값 모두 null)는 통과시킨다.** 만료 판정의 대상 자체가 없기 때문이다.
 * AS-IS 마이그레이션 쿼리가 `status IN ('1','5')` 를 모두 「利用可」로 다루고(`5`=WEB研修 =
 * `M_SEMINAR_USER` 教育申請中), 교육 신청 단계 회원은 아직 시공ID 가 발급되기 전일 수 있다.
 * 여기서 fail-closed 로 접으면 그 회원들이 로그인 자체를 못 하게 된다.
 *
 * 반대로 **값이 있는데 파싱이 안 되면 차단**한다(fail-closed). 형식이 깨진 유효기간을
 * 「유효」로 접으면 만료 게이트가 조용히 무력화된다 — `parseSekoDate` 실패를 2FA 에서
 * fail-closed 로 다루는 것과 같은 기준이다.
 */
export function evaluateSekoIdValidity(params: {
  sekoStatus: number | null;
  sekoLimit: string | null;
  now?: Date;
}): SekoIdValidity {
  const { sekoStatus, sekoLimit, now = new Date() } = params;

  if (sekoStatus === SEKO_ID_STATUS_EXPIRED) {
    return { valid: false, reason: "STATUS_EXPIRED" };
  }

  if (sekoLimit === null || sekoLimit.trim() === "") {
    // 상태값도 만료일도 없으면 시공ID 미보유로 본다. 상태값이 「有効」이면 그대로 유효.
    return { valid: true, reason: sekoStatus === null ? "NO_SEKO_ID" : "ACTIVE" };
  }

  const limitIso = parseSekoDate(sekoLimit);
  if (!limitIso) {
    return { valid: false, reason: "UNPARSABLE_LIMIT" };
  }

  // 만료일 종일 유효 — 다음날 자정부터 만료.
  const expiresAt = jstNextDayStart(new Date(limitIso));
  if (now.getTime() >= expiresAt.getTime()) {
    return { valid: false, reason: "LIMIT_PASSED" };
  }

  return { valid: true, reason: "ACTIVE" };
}

/**
 * No.9 Seko 2FA Save API — 2차인증 완료 일시 저장 (Bearer).
 *
 * TO-BE 에서 2FA 를 통과한 직후 호출해 AS-IS 의 `secAuthDt` 를 갱신한다. 이 값이 다음 로그인의
 * 재인증 주기 판정 근거이므로, 갱신에 실패하면 사용자가 매 세션 2FA 를 다시 받게 된다.
 * (QSP 경로의 `updateSecAuthDt` 와 같은 자리 — 호출부는 QSP 와 동일하게 fail-open 으로 다룬다.)
 *
 * 과거 일시로도 덮어쓸 수 있다(2026-08-18 실측) — 테스트에서 만료 상태를 만들 때 쓴다.
 */
export async function sekoSave2faVerified(
  userId: string,
  loginId: string,
  secAuthDt: string,
  token: string,
  logTag: string,
): Promise<{ ok: true } | { ok: false; error: SekoFetchError }> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/save2faVerified"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, loginId, secAuthDt }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "save2faVerified",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 2차인증 일시 저장 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  // 상태 판정을 본문 파싱보다 **앞**에 둔다. 401 인데 본문이 비었거나 HTML(프록시/게이트웨이
  // 응답)이면 파싱·스키마 단계에서 502 로 접혀, 호출부의 401 세션 종료 분기가 영영 발동하지
  // 않는다 — 죽은 Bearer 를 담은 twoFactorVerified=true 세션이 그대로 남는다.
  if (response.status === 401) {
    console.warn(`${logTag} SEKO 2차인증 일시 저장 인증 실패 (HTTP 401) — 세션 종료 대상`);
    return {
      ok: false,
      error: { error: "2段階認証情報の保存に失敗しました", status: 401 },
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 2차인증 일시 저장 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoNoDataResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 2차인증 일시 저장 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { result } = parsed.data;
  // 상태와 본문을 함께 본다 — 비-2xx 인데 resultCode="S" 라는 이유로 성공 처리하면
  // 기록되지 않은 secAuthDt 를 "기록됨" 으로 오인해 다음 로그인 판정이 어긋난다.
  if (!response.ok || result.resultCode !== "S") {
    console.warn(
      `${logTag} SEKO 2차인증 일시 저장 실패 (http: ${response.status}, resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    const status = mapSekoFailureStatus(response.status, result.errorCode);
    return {
      ok: false,
      error: { error: "2段階認証情報の保存に失敗しました", status, errorCode: result.errorCode ?? undefined },
    };
  }

  return { ok: true };
}

/**
 * No.8 Seko Email Check API — 시공점 회원 존재 확인 (X-Api-Key).
 *
 * 비밀번호 분실 등 **로그인 불가 상태**에서 호출하므로 Bearer 가 아닌 서버 고정키를 쓴다.
 *
 * ⚠️ 요청 파라미터는 `loginId` **단독**이다. 사양서(20260811)는 `groupKind`/`sei`/`mei` 를
 * 필수로 기재하나, 실제로 4개를 보내면 `400 INVALID_REQUEST` 이고 loginId 단독만 200 이다
 * (2026-08-13 preview 실측). 사양서가 정정되기 전까지 실물 기준을 유지한다.
 *
 * 응답에 이메일이 없다 — 시공점은 loginId = email 이므로 호출부가 입력값을 그대로 쓴다.
 */
export async function sekoEmailCheck(
  loginId: string,
  logTag: string,
): Promise<
  | { ok: true; data: SekoEmailCheckData }
  | { ok: false; error: SekoFetchError }
> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/email/check"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, ...sekoApiKeyHeader() },
        body: JSON.stringify({ loginId }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "emailCheck",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 회원 존재확인 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 회원 존재확인 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoEmailCheckResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 회원 존재확인 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    console.warn(
      `${logTag} SEKO 회원 존재확인 실패 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    return {
      ok: false,
      error: {
        error: "会員情報を確認できません",
        status: mapSekoFailureStatus(response.status, result.errorCode),
        errorCode: result.errorCode ?? undefined,
      },
    };
  }

  return { ok: true, data };
}

/**
 * No.10 Seko Password Reset API — 시공점 비밀번호 재설정 (X-Api-Key).
 *
 * Bearer·현재 비밀번호 **모두 불요** — loginId + 새 비밀번호만으로 재설정한다.
 * 로그인 자체가 불가한 사용자(비밀번호 분실·미설정)를 위한 API 이며,
 * 로그인은 되지만 비밀번호 설정이 필요한 경우(180일 경과 등)는 No.6 `changePwd(chgType=I)` 를 쓴다.
 *
 * 재설정 후에도 `pwdInitYn` 은 `N` 을 유지한다(2026-08-14 preview 실측) — 다음 로그인에서
 * 초기화 팝업이 다시 뜨지 않는다.
 */
export async function sekoResetPwd(
  loginId: string,
  newPwd: string,
  logTag: string,
): Promise<SekoResetPwdResult> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/resetPwd"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, ...sekoApiKeyHeader() },
        body: JSON.stringify({ loginId, chgPwd: newPwd }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "resetPwd",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 비밀번호 재설정 호출 실패:`, error);
    // 타임아웃 포함 — 요청이 도달해 처리까지 끝난 뒤 응답만 유실됐을 수 있다.
    return {
      ok: false,
      error: { error: "外部サーバーに接続できません", status: 502 },
      indeterminate: true,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 비밀번호 재설정 응답 파싱 실패 (status: ${response.status}):`, error);
    // 응답 본문을 읽지 못했으므로 resultCode 를 알 수 없다 — 처리 여부 불명.
    return {
      ok: false,
      error: { error: "外部サーバーの応答を処理できません", status: 502 },
      indeterminate: true,
    };
  }

  const parsed = sekoNoDataResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 비밀번호 재설정 응답 스키마 불일치:`, parsed.error.issues);
    // 위와 동일 — resultCode 를 신뢰할 수 없으므로 실패로 단정하지 않는다.
    return {
      ok: false,
      error: { error: "外部サーバーの応答形式が正しくありません", status: 502 },
      indeterminate: true,
    };
  }

  const { result } = parsed.data;
  if (result.resultCode !== "S") {
    console.warn(
      `${logTag} SEKO 비밀번호 재설정 실패 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    return {
      ok: false,
      error: {
        error: "パスワードの再設定に失敗しました",
        status: mapSekoFailureStatus(response.status, result.errorCode),
        errorCode: result.errorCode ?? undefined,
      },
      // Connector 가 명시적으로 거부했다 — 비밀번호는 그대로임이 확정.
      indeterminate: false,
    };
  }

  return { ok: true };
}


/** No.7 getUserList `status` — 利用不可. 발송 대상에서 빼기 위해 **제외 목록으로만** 쓴다. */
const SEKO_USER_STATUS_UNAVAILABLE = "2";

/**
 * No.7 Seko User List API — 시공점 회원 목록 조회 (X-Api-Key). **대량메일 수신자 수집 전용.**
 *
 * ## 왜 두 번 호출하는가
 *
 * 발송 대상은 「利用可」 회원이고, 사양서상 그건 `status` **1(利用可) 과 5(WEB研修) 둘 다**다.
 * AS-IS 마이그레이션 쿼리(`qpartners_migration_query_ja_prod.sql`)가 근거다:
 *
 * ```sql
 * -- 対象 status: '1' (利用可) / '5' (利用可)
 * AND status IN ('1', '5')
 * ```
 *
 * `5` 는 정지·탈퇴가 아니라 `M_SEMINAR_USER` 教育申請中(시공ID 교육 신청) 단계의 **활성 회원**이다.
 *
 * 그런데 이 API 의 `status` 필터는 **`"1"` / `"2"` / 미지정(전체)** 세 가지뿐이다(사양서
 * `Seko User List API` r6 — 목록 필터에는 `5` 가 아예 없다. `getUserInfo` r31 의 `status` 는
 * 1/2/5 인데 **같은 필드를 필터에서만 1/2 로 받는다**). `"1,2"` 나 `5` 는
 * `INVALID_STATUS_ERROR`(`statusの値が不正です`), 배열 `[1,2]` 는 조용히 무시된다.
 * 즉 **`1 ∪ 5` 를 직접 고르는 요청이 없다.** 그래서 `전체 − 2` 로 같은 집합을 만든다:
 *
 * ```
 * 1) {}              → 전체 (1+2+5)   preview 실측 104건
 * 2) {status:"2"}    → 利用不可        preview 실측   8건
 *    userId 차집합                   = 96건 = 利用可(1) + WEB研修(5)
 * ```
 *
 * **「利用不可」 판정은 여전히 AS-IS 가 내린다** — 우리는 상태값을 해석하지 않고 AS-IS 가 준
 * 제외 목록을 뺄 뿐이다. 응답 5필드(`userId`/`loginId`/`sei`/`mei`/`newsRcptYn`)에 `status` 가
 * 없어 어차피 우리 쪽 분류는 불가능하기도 하다.
 *
 * **호출 순서가 중요하다 — 전체 → 제외 순.** 두 호출 사이에 비활성화된 회원은 뒤의 제외 목록에
 * 잡혀 빠진다. 순서를 뒤집으면 그 회원이 발송 대상에 남는다.
 *
 * 한쪽이라도 실패하면 **전체를 실패로 접는다.** 제외 목록만 실패했다고 전체를 그대로 돌려주면
 * 利用不可 회원에게 발송된다.
 *
 * ⚠️ preview 에 `status=5` 회원이 0명이라(96+8=104=전체) **「5가 실제로 포함된다」는 결과는
 * 미검증**이다. 차집합 산술이 성립한다는 것까지만 확인됐다.
 *
 * **페이징이 없다.** QSP `userListMng` 와 달리 요청의 page/size 계열 파라미터가 전부 무시되고
 * 전량이 한 번에 온다. 회원 수가 늘면 응답이 그만큼 커지므로 타임아웃만 공용값을 쓴다.
 *
 * 반환 목록의 `loginId` 가 곧 이메일이다(시공점은 로그인 ID = 이메일). 이메일 전용 필드는
 * 응답에 없다.
 */
export async function sekoGetUserList(
  logTag: string,
): Promise<
  | { ok: true; items: SekoUserListItem[] }
  | { ok: false; error: SekoFetchError }
> {
  // 전체 → 제외 순서 고정 (위 주석 참조).
  const all = await fetchSekoUserListByStatus(null, logTag);
  if (!all.ok) return all;

  const unavailable = await fetchSekoUserListByStatus(SEKO_USER_STATUS_UNAVAILABLE, logTag);
  if (!unavailable.ok) return unavailable;

  const excluded = new Set(unavailable.items.map((item) => item.userId));
  const items = all.items.filter((item) => !excluded.has(item.userId));

  console.log(
    `${logTag} SEKO 회원목록 차집합 — 전체=${all.items.length}, 利用不可=${unavailable.items.length}, 대상=${items.length}`,
  );

  return { ok: true, items };
}

/**
 * `getUserList` 1회 호출 — `status` 미지정(`null`)이면 전체.
 *
 * **결손은 부분·전량 가리지 않고 실패로 접는다.** 항목 하나라도 스키마에 맞지 않거나
 * `totalCount` 와 파싱 건수가 다르면 목록을 돌려주지 않는다 — 부분 목록으로 발송하면 누락된
 * 회원이 수신자 스냅샷에 남지 않아 재시도로도 복구되지 않기 때문이다. 제외 목록 쪽이 결손되면
 * 利用不可 회원이 대상에 남으므로, 같은 기준이 양쪽 호출 모두에 필요하다.
 */
async function fetchSekoUserListByStatus(
  status: string | null,
  logTag: string,
): Promise<
  | { ok: true; items: SekoUserListItem[] }
  | { ok: false; error: SekoFetchError }
> {
  // 같은 apiName 으로 2회 호출되므로 로그에서 어느 쪽이 실패했는지 구분할 표식이 필요하다.
  const scope = status === null ? "전체" : `status=${status}`;

  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/getUserList"),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, ...sekoApiKeyHeader() },
        // 미지정({})이 「전체」다 — 필터 없이 보내야 1(利用可)+5(WEB研修)+2(利用不可) 가 온다.
        body: JSON.stringify(status === null ? {} : { status }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "getUserList",
        callerRoute: logTag,
        // 특정 회원에 대한 호출이 아니다 — userId 를 넣을 자리가 없다.
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 회원목록 조회 호출 실패 (${scope}):`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 회원목록 조회 응답 파싱 실패 (${scope}, status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoUserListResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 회원목록 조회 응답 스키마 불일치 (${scope}):`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    console.warn(
      `${logTag} SEKO 회원목록 조회 실패 (${scope}, resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    return {
      ok: false,
      error: {
        error: "会員情報を確認できません",
        status: mapSekoFailureStatus(response.status, result.errorCode),
        errorCode: result.errorCode ?? undefined,
      },
    };
  }

  const { totalCount, list } = data;
  const items: SekoUserListItem[] = [];
  let dropped = 0;
  for (const row of list) {
    const parsedItem = sekoUserListItemSchema.safeParse(row);
    if (parsedItem.success) items.push(parsedItem.data);
    else dropped++;
  }

  // 부분 결손도 전량 결손과 똑같이 접는다. 일부만 발송한 뒤 메일이 sent 로 확정되면 누락된
  // 회원은 수신자 스냅샷에 없어 재시도로도 복구되지 않고, 「일부에게만 안 갔다」는 사실이
  // 어디에도 남지 않는다. 커넥터 장애와 동급으로 올려 send_failed → 재시도 경로로 보낸다.
  if (dropped > 0 || items.length !== totalCount) {
    console.error(
      `${logTag} SEKO 회원목록 결손 (${scope}) — totalCount=${totalCount}, 응답행=${list.length}, 파싱성공=${items.length}, 드롭=${dropped}`,
    );
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  return { ok: true, items };
}
