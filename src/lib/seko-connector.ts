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
 * 현재 구현: No.2 Login / No.3 User Info / No.4 User Info Update / No.5 File Download /
 * No.6 Password Change / No.8 Email Check / No.9 2FA Save / No.10 Password Reset.
 * 나머지 API(autologin/getUserList)는 각 I/F 브랜치에서 추가된다.
 */

import { ConfigError } from "@/lib/errors";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import {
  sekoEmailCheckResponseSchema,
  sekoFileDownloadResponseSchema,
  sekoLoginResponseSchema,
  sekoNoDataResponseSchema,
  sekoUserInfoResponseSchema,
  type SekoEmailCheckData,
  type SekoLoginData,
  type SekoUserInfoData,
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
  // 절대 URL 은 커넥터 origin 과 일치할 때만 허용한다. 무검증으로 통과시키면
  //  1) sekoBaseUrl() 을 거치지 않아 운영 HTTPS 강제 가드가 통째로 우회되고
  //     (AS-IS 가 http:// 를 돌려주는 순간 24시간 유효한 Bearer 가 평문으로 나간다)
  //  2) 임의 호스트를 받으면 서버가 그리로 아웃바운드를 보내고 응답을 사용자에게
  //     그대로 흘리는 SSRF 프록시가 된다.
  // 불일치면 토큰을 붙이지 않고 502 로 종료한다.
  const baseUrl = sekoBaseUrl();
  let fileUrl: string;
  if (/^https?:\/\//i.test(data.fileUrl)) {
    let candidate: URL | null = null;
    try {
      candidate = new URL(data.fileUrl);
    } catch {
      candidate = null;
    }
    if (!candidate || candidate.origin !== new URL(baseUrl).origin) {
      console.error(
        `${logTag} SEKO fileUrl origin 불일치 — Bearer 미부착 후 중단 (origin: ${candidate?.origin ?? "parse-failed"})`,
      );
      return { ok: false, error: { error: "ファイルの取得に失敗しました", status: 502 } };
    }
    fileUrl = candidate.toString();
  } else {
    fileUrl = `${baseUrl}${data.fileUrl.startsWith("/") ? "" : "/"}${data.fileUrl}`;
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
