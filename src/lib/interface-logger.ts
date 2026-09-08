/**
 * 외부 시스템 인터페이스 로그 유틸리티
 *
 * QSP, 시공점 등 외부 API 호출 시 qp_interface_log 테이블에 자동 기록.
 * 로그 실패 시에도 본 요청 흐름을 블로킹하지 않음 (fire-and-forget).
 */

import { prisma } from "@/lib/prisma";

export type InterfaceLogParams = {
  system: "QSP" | "SEKO";
  direction: "OUTBOUND" | "INBOUND";
  apiName: string;
  callerRoute: string;
  /**
   * `qp_interface_log.user_id` 에 남길 식별자. **원문을 넘겨도 된다** — 저장 직전
   * `maskUserId` 로 중앙 마스킹된다(멱등이므로 호출부에서 이미 마스킹했어도 무방).
   */
  userId?: string;
  userType?: string;
  /**
   * true 지정 시 응답 본문 전체를 `[masked:cipher-response]` 로 치환하여 저장.
   * 응답 객체 안에 `userId` 키 등으로 cipher / 토큰이 포함되는 API 전용
   * (예: QSP autoLoginEncryptData — 응답 `data.userId` 가 base64 cipher).
   * SENSITIVE_KEYS / EMAIL_KEYS 의 키 단위 마스킹으로는 누락되는 케이스를 fail-closed 로 차단.
   */
  maskResponseBody?: boolean;
  /**
   * true 지정 시 응답 본문을 **읽지 않는다**. 바이너리 응답(파일 다운로드 프록시) 전용.
   *
   * `maskResponseBody` 는 본문을 읽은 뒤 저장값만 치환하므로, 바이너리에는 부족하다 —
   * 파일 전체가 JS 문자열로 디코드되어(메모리 2배) `JSON.parse` 가 두 번 실패하고
   * 매 호출마다 무의미한 WARN 이 쌓인다. 이 옵션은 읽기 자체를 건너뛴다.
   *
   * 호출 기록(status·durationMs·traceId·requestBody)은 그대로 남으므로 감사 추적은 유지된다.
   * `resultCode` 는 본문에서 파생되므로 null 이 된다(바이너리에는 애초에 없다).
   */
  skipResponseBody?: boolean;
};

const MASKED_RESPONSE_PLACEHOLDER = "[masked:cipher-response]";
// 본문을 읽지 않았음을 명시 — "응답이 비었던 것" 과 구분되어야 운영 진단이 헷갈리지 않는다.
const SKIPPED_RESPONSE_PLACEHOLDER = "[skipped:binary-response]";

/**
 * JSON 파싱에 실패한 본문의 치환값.
 *
 * 구조를 신뢰할 수 없는 본문(값이 따옴표 없이 깨진 `{"userNm":山田太郎}`, HTML 에러 페이지,
 * 절단된 응답 등)은 키 단위 마스킹도 정규식 폴백도 누락을 보장할 수 없다. 장애·버전 불일치
 * 상황이야말로 fail-closed 가 가장 필요한 시점이므로 본문 전체를 통째로 가린다.
 * 진단에 필요한 `responseStatus` / `durationMs` / `errorMessage` 는 별도 컬럼에 그대로 남는다.
 */
const UNPARSABLE_BODY_PLACEHOLDER = "[masked:unparsable-body]";

/**
 * 최상위 스칼라(JSON 문자열·숫자) 본문의 치환값.
 *
 * 파싱 자체는 성공했으나 키가 없어 값 단위 판별이 불가능한 경우다. 파싱 실패와 같은 placeholder
 * 를 쓰면 운영자가 `"OK"` 같은 정상 스칼라 응답과 깨진 본문을 구분할 수 없어 분리한다.
 */
const SCALAR_BODY_PLACEHOLDER = "[masked:scalar-body]";

const SENSITIVE_KEYS = new Set([
  "pwd",
  "password",
  "newPwd",
  "curPwd",
  "chgPwd",
  "newPassword",
  "currentPassword",
  // 세션/인증 토큰 — SEKO login 응답 data.token(Bearer 24h) 등이 로그에 평문 저장되지 않도록.
  // URL 쿼리(URL_SENSITIVE_QUERY_KEYS)와 동일 집합을 body 마스킹에도 적용.
  "token",
  "accessToken",
  "refreshToken",
  // SEKO autologin(No.1) 응답 data.autologinUrl — AS-IS 세션을 발급받을 수 있는 일회용 링크다.
  // 토큰이 쿼리가 아니라 **path segment**(`/api/autologin/{64자}`)라 maskSensitiveQueryInUrl 로는
  // 안 가려지므로 키 단위로 막는다. 위 `token` 과 성격이 같다 — 자격증명 자체가 URL 인 형태.
  "autologinUrl",
  // 사용자 자유기입 PII 가능 — 탈퇴 사유(유저 불만·개인정보 혼입 가능)
  "resignRsn",
  "resignRemark",
  "reason",
]);

// loginId: GENERAL 회원의 경우 userId === email 이므로 이메일 주소가 그대로 로그에 남는다.
// EMAIL_KEYS 로 마스킹해 GENERAL/ADMIN/STORE 모두 공통 처리.
const EMAIL_KEYS = new Set(["email", "loginId"]);

/**
 * 개인정보 필드 — 값 전체를 `***` 로 치환한다.
 *
 * **QSP·SEKO 사양서 응답 필드 전수 조사 기준**(2026-08-13). 두 시스템은 같은 정보를 **다른
 * 필드명**으로 내려주므로 양쪽을 모두 담아야 한다 — 한쪽만 넣으면 다른 쪽이 평문으로 남는다.
 *   - QSP: `IP-DE-SI_QSP.Connector.API 인터페이스 사양서_v1.0.xlsx` (userDetail/login/
 *     newUserReq/updateUserDtl/userListMng/saveResignReq 등 13개 API 응답)
 *   - SEKO: `(AS-IS)Q.Partners.Connector.API 인터페이스 사양서_20260811.xlsx` (login/getUserInfo)
 *
 * 마스킹 후에도 응답 구조와 `result`/`resultCode`/`errorCode` 는 보존되므로 스키마 불일치·
 * 비즈니스 거부 진단은 그대로 가능하다(`maskResponseBody` 전체 치환과 다른 점).
 *
 * 코드·플래그·일시(`authCd`/`statCd`/`newsRcptYn`/`secAuthDt` 등)는 개인 식별에 기여하지 않고
 * 진단 가치가 크므로 대상에서 제외한다.
 */
const PII_KEYS = new Set([
  // ─ 성명 (QSP: userNm 계열 / SEKO: sei·mei 계열)
  "userNm",
  "userNmKana",
  "user1stNm",
  "user2ndNm",
  "user1stNmKana",
  "user2ndNmKana",
  "uptNm",
  "sei",
  "mei",
  "seiKana",
  "meiKana",
  // ─ 회사·상호 (QSP: compNm / SEKO: storeName)
  "compNm",
  "compNmKana",
  "storeName",
  "storeNameKana",
  // ─ 주소 (QSP: compAddr·compPostCd / SEKO: address·zipcode)
  "compAddr",
  "compAddr2",
  "compPostCd",
  "address1",
  "address2",
  "zipcode",
  // ─ 연락처 (QSP: compTelNo·compFaxNo / SEKO: telNo·fax)
  "compTelNo",
  "compFaxNo",
  "telNo",
  "fax",
  // ─ 사업자·자격 식별번호
  "compBizNo",
  // QSP 는 같은 법인번호를 API 마다 다른 이름으로 다룬다 — updateUserDtl 요청은 `bizNo`,
  // userDetail 응답은 `corporateNo`(schemas/member.ts qspMemberDetailSchema). 셋 다 필요하다.
  "bizNo",
  "corporateNo",
  "sekoId",
  // 직위 — 회원가입·마이페이지 자유기입(`schemas/signup.ts`·`mypage.ts`). `deptNm` 과 달리
  // 마스터 카탈로그 API 가 없어 보존해서 얻을 진단 이득이 없으므로 상시 마스킹한다.
  "pstnNm",
]);

/**
 * 사용자 식별자 키 — `maskUserId` 로 축약한다(이메일이면 부분 마스킹, 아니면 앞 2자).
 *
 * QSP 는 GENERAL 회원의 `userId` 가 곧 이메일이다(`schemas/member.ts` "userId=이메일 문자열").
 * `qp_interface_log.user_id` 컬럼은 전 호출처가 마스킹하는데 body 안의 같은 값이 평문으로
 * 남으면 그 통제가 무력화된다 — 예: signup 의 `{ userId: email, email }` 은 한쪽만 가려진다.
 * `updBy`(수정자)도 같은 형태로 관리자 이메일을 담는다.
 *
 * `maskEmail` 이 아니라 `maskUserId` 를 쓰는 이유: STORE 등 `@` 없는 식별자도 축약해야 하는데
 * `maskEmail` 은 `@` 가 없으면 원문을 통과시킨다.
 */
const USER_ID_KEYS = new Set(["userId", "updBy"]);

/**
 * 부서 "명칭" — **기본 마스킹**, 마스터 카탈로그 조회에서만 보존한다.
 *
 * `deptNm` 은 두 가지 성격을 겸한다.
 *   1) 코드 카탈로그 값 — `apiName: "deptList"` 응답은 `{ deptCd, deptNm }` 만 담는다
 *      (`src/lib/schemas/master.ts`). 여기서 가리면 개인정보 보호 효과 없이 진단 가치만 사라진다.
 *   2) 개인의 소속 — 회원가입·마이페이지의 부서는 자유기입이고(`schemas/signup.ts`·`mypage.ts`)
 *      login/userDetail 응답에도 실려 나간다. 단독 식별력은 낮지만 다른 필드와 결합하면
 *      재식별 보조가 되므로 개인정보로 다뤄야 한다.
 *
 * 따라서 전역 on/off 가 아니라 `apiName` 기준으로 분기한다 — (1) 의 카탈로그 API 에서만 보존.
 * 같은 성격이던 `pstnNm` 은 대응하는 카탈로그 API 가 없어 `PII_KEYS` 로 옮겼다(예외 표면 축소).
 */
const CATALOG_NAME_KEYS = new Set(["deptNm"]);

/**
 * `CATALOG_NAME_KEYS` 를 마스킹하지 않는 apiName 집합 (마스터 카탈로그 조회 전용).
 * 사용자 개인 데이터를 응답에 담지 않는 API 만 추가할 것 — 여기에 넣는 순간 그 API 의
 * `deptNm` 은 전 경로에서 평문 저장된다.
 *
 * 로깅은 zod 검증 **이전**의 원문에 대해 이뤄지고 응답 스키마는 non-strict 라 미지 키를 조용히
 * 버리므로, 여기 등재된 API 의 실제 페이로드가 바뀌면(개인 데이터 추가) 파싱 실패로 드러나지
 * 않고 로그에만 평문으로 남는다 — 사양 변경 시 이 목록을 재검증할 것.
 */
const CATALOG_API_NAMES = new Set(["deptList"]);

const MAX_BODY_LENGTH = 8_000;
const MAX_MASK_DEPTH = 10;
/** DB VARCHAR(500) 제한 — 말줄임 여유 포함 */
const MAX_ERROR_MSG_LENGTH = 490;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function maskEmail(value: string): string {
  const atIdx = value.indexOf("@");
  if (atIdx <= 0) return value;
  return value[0] + "***" + value.slice(atIdx);
}

/**
 * userId 범용 마스킹 — 이메일/로그인ID(STORE 등)/임의 식별자 모두 대응.
 * 이메일 형식은 maskEmail 적용, 나머지는 앞 2자 + "***" 로 축약.
 */
export function maskUserId(value: string): string {
  if (!value) return value;
  if (value.includes("@")) return maskEmail(value);
  if (value.length <= 2) return "***";
  return value.slice(0, 2) + "***";
}

function truncateBody(text: string | null): string | null {
  if (!text) return null;
  if (text.length <= MAX_BODY_LENGTH) return text;
  return text.slice(0, MAX_BODY_LENGTH) + "...[truncated]";
}

function maskObjectFields(
  obj: Record<string, unknown>,
  preserveCatalogNames: boolean,
  depth = 0,
): Record<string, unknown> {
  if (depth > MAX_MASK_DEPTH) return { "[truncated]": true };
  const masked: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] = "***";
    } else if (PII_KEYS.has(key) && val != null && val !== "") {
      // 값 타입을 가리지 않는다 — zipcode/telNo 는 문자열/숫자 양쪽으로 오므로
      // `typeof val === "string"` 으로 좁히면 숫자 응답이 평문으로 통과한다.
      //
      // 빈 문자열은 마스킹하지 않는다 — `qsp-member.ts` 의 buildQspPreservedFields 가 QSP
      // full-replace 로부터 값을 지키려고 null 을 "" 로 바꿔 보내므로, ""(값 없음)과
      // 실제 값을 구분할 수 있어야 "필드가 통째로 날아갔다" 는 사고를 로그로 추적할 수 있다.
      masked[key] = "***";
    } else if (
      CATALOG_NAME_KEYS.has(key) &&
      !preserveCatalogNames &&
      val != null &&
      val !== ""
    ) {
      masked[key] = "***";
    } else if (USER_ID_KEYS.has(key) && typeof val === "string") {
      masked[key] = maskUserId(val);
    } else if (EMAIL_KEYS.has(key) && typeof val === "string") {
      masked[key] = maskEmail(val);
    } else if (Array.isArray(val)) {
      masked[key] = val.map((item) =>
        isRecord(item)
          ? maskObjectFields(item, preserveCatalogNames, depth + 1)
          : item,
      );
    } else if (isRecord(val)) {
      masked[key] = maskObjectFields(val, preserveCatalogNames, depth + 1);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

/**
 * 로그 저장용 본문 마스킹.
 *
 * JSON 으로 파싱된 경우에만 키 단위 마스킹을 적용하고, 파싱에 실패하면 본문 전체를
 * `UNPARSABLE_BODY_PLACEHOLDER` 로 치환한다(fail-closed). 이전에는 정규식 폴백으로 부분
 * 복구를 시도했으나, 값 형식까지 손상된 본문(`{"userNm":山田太郎}` 등)에는 매칭되지 않아
 * 가장 마스킹이 필요한 장애 상황에서 PII 가 평문으로 남았다.
 *
 * @param preserveCatalogNames `CATALOG_NAME_KEYS`(deptNm) 보존 여부.
 *   마스터 카탈로그 조회(`CATALOG_API_NAMES`)에서만 true.
 */
function maskSensitiveFields(
  body: string | null | undefined,
  preserveCatalogNames: boolean,
): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) {
      const masked = maskObjectFields(parsed, preserveCatalogNames);
      return truncateBody(JSON.stringify(masked));
    }
    if (Array.isArray(parsed)) {
      const masked = parsed.map((item) =>
        isRecord(item) ? maskObjectFields(item, preserveCatalogNames) : item,
      );
      return truncateBody(JSON.stringify(masked));
    }
    // 최상위 스칼라(JSON 문자열·숫자) — 키가 없어 값 단위 판별이 불가능하므로 보수적으로 가린다.
    return SCALAR_BODY_PLACEHOLDER;
  } catch {
    // 의도적 bare catch — SyntaxError 메시지는 파싱에 실패한 **입력 조각을 그대로 포함**하므로
    // 오류 객체를 로그에 넘기면 콘솔로 PII 가 재노출된다(마스킹 우회 경로).
    // 진단은 본문 길이 등 비민감 메타데이터로만 수행한다.
    console.warn(
      `[InterfaceLogger] 본문 JSON 파싱 실패 — 전체 마스킹 처리 (length=${body.length})`,
    );
    return UNPARSABLE_BODY_PLACEHOLDER;
  }
}

/**
 * URL 쿼리스트링에서 PII/민감 파라미터 값을 마스킹.
 *
 * 대상 키:
 *   - email / loginId: 이메일 형식은 maskEmail, 그 외는 앞 2자 + "***"
 *   - autoLoginParam1: userId(=loginId/email) 평문 (URL-encoded 가능) → 전체 "***" 대체
 *     (cipher 가 들어오는 경우도 있으나 qp_interface_log 에 cipher 전문이 남을 필요 없음)
 *   - token / accessToken / refreshToken: 전체 "***"
 *
 * 호출 경로:
 *   - fetchWithLog 의 requestUrl 로깅 (baseLog.requestUrl)
 *   - fetch error 의 errorMessage 내부 URL 문자열
 */
const URL_SENSITIVE_QUERY_KEYS = new Set([
  "email",
  "loginid",
  "autologinparam1",
  "token",
  "accesstoken",
  "refreshtoken",
  // PII·식별자 키는 **body 집합에서 파생**한다. 손으로 나열하면 body 만 막고 URL 은 뚫린 채
  // 남는다 — 실제로 회원관리 검색은 `?userNm=山田太郎&compNm=…` 로 나가므로(admin/members
  // route) PII_KEYS 확장이 URL 에 반영되지 않으면 검색어가 그대로 request_url 에 저장된다.
  // 쿼리 키 비교는 소문자 기준이므로 정규화해서 넣는다.
  // 카탈로그 키도 포함한다 — URL 은 apiName 분기가 없으므로 보수적으로 항상 가린다.
  // `deptList` 요청 URL 은 `deptNm` 을 파라미터로 갖지 않아 카탈로그 진단 손실이 없다.
  ...[...PII_KEYS, ...USER_ID_KEYS, ...CATALOG_NAME_KEYS].map((key) =>
    key.toLowerCase(),
  ),
]);

function maskSensitiveQueryInUrl(input: string): string {
  return input.replace(
    /([?&])([A-Za-z0-9_]+)=([^&\s]+)/g,
    (_match, sep: string, key: string, value: string) => {
      const lowered = key.toLowerCase();
      if (!URL_SENSITIVE_QUERY_KEYS.has(lowered)) return _match;
      if (lowered === "email" || lowered === "loginid") {
        let decoded = value;
        try {
          decoded = decodeURIComponent(value);
        } catch {
          // 인코딩 파싱 실패 — 원문 그대로 마스킹 시도
        }
        const atIdx = decoded.indexOf("@");
        if (atIdx > 0) {
          const masked = decoded[0] + "***" + decoded.slice(atIdx);
          return `${sep}${key}=${encodeURIComponent(masked)}`;
        }
        if (decoded.length <= 2) return `${sep}${key}=***`;
        return `${sep}${key}=${encodeURIComponent(decoded.slice(0, 2) + "***")}`;
      }
      return `${sep}${key}=***`;
    },
  );
}

function extractResultCode(responseBody: string | null): string | null {
  if (!responseBody) return null;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (isRecord(parsed)) {
      const result: unknown = parsed.result;
      if (isRecord(result)) {
        const code: unknown = result.resultCode;
        if (typeof code === "string") return code;
      }
    }
    return null;
  } catch {
    // 의도적 bare catch — maskSensitiveFields 와 동일 이유(SyntaxError 메시지에 입력 조각 포함).
    console.warn(
      `[InterfaceLogger] resultCode 추출 실패 — 응답 본문 JSON 파싱 불가 (length=${responseBody.length})`,
    );
    return null;
  }
}

/**
 * 외부 API 호출 + 인터페이스 로그 자동 기록
 *
 * 기존 fetch()와 동일한 Response를 반환하므로 호출부 변경 최소화.
 * 주의: 반환된 Response의 body는 이미 소비되지 않은 상태 (clone 사용).
 */
export async function fetchWithLog(
  url: string,
  init: RequestInit,
  params: InterfaceLogParams,
): Promise<Response> {
  const traceId = crypto.randomUUID();
  const startTime = performance.now();
  const method = (init.method ?? "GET").toUpperCase();

  const requestBody = typeof init.body === "string" ? init.body : null;
  const preserveCatalogNames = CATALOG_API_NAMES.has(params.apiName);

  const baseLog = {
    traceId,
    system: params.system,
    direction: params.direction,
    apiName: params.apiName,
    method,
    requestUrl: maskSensitiveQueryInUrl(url),
    requestBody: maskSensitiveFields(requestBody, preserveCatalogNames),
    callerRoute: params.callerRoute,
    // 저장 직전 중앙 마스킹 — 호출부가 `maskEmail` 만 적용하면 `@` 없는 STORE/SEKO 로그인 ID 가
    // 원문 그대로 통과한다(`maskEmail` 은 `@` 없으면 입력을 반환). 두 함수 모두 멱등이므로
    // 호출부의 기존 마스킹과 중복 적용해도 결과가 바뀌지 않는다.
    userId: params.userId != null ? maskUserId(params.userId) : null,
    userType: params.userType ?? null,
  };

  let response: Response;
  let responseBodyText: string | null = null;

  try {
    // 전 호출자의 cache 전략은 호출 지점에서 명시(호출 지점 가시성 + 전역 부수효과 회피).
    // 외부 API 호출은 호출부에서 `cache: "no-store"` 을 명시하는 것을 원칙으로 함.
    response = await fetch(url, init);

    // 바이너리 응답은 읽지 않는다 — clone().text() 는 파일 전체를 문자열로 디코드한다.
    if (!params.skipResponseBody) {
      const cloned = response.clone();
      try {
        responseBodyText = await cloned.text();
      } catch (error: unknown) {
        console.warn("[InterfaceLogger] 응답 body 읽기 실패:", error);
      }
    }
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - startTime);
    const rawMsg = error instanceof Error ? error.message : String(error);

    writeLog({
      ...baseLog,
      responseStatus: 0,
      responseBody: null,
      resultCode: "F",
      durationMs,
      // fetch error 메시지에 URL 이 포함될 수 있음 → 쿼리스트링 민감값 마스킹 후 저장.
      errorMessage: maskSensitiveQueryInUrl(rawMsg).slice(0, MAX_ERROR_MSG_LENGTH),
    });

    throw error;
  }

  const durationMs = Math.round(performance.now() - startTime);
  const resultCode = extractResultCode(responseBodyText);

  // cipher / 토큰 응답 API 는 본문 전체를 통째로 마스킹.
  // 키 단위 마스킹(SENSITIVE_KEYS / EMAIL_KEYS)으로는 응답 스키마가 `userId` 등 일반 키명에
  // cipher 를 담는 케이스(QSP autoLoginEncryptData)를 잡지 못하므로 fail-closed.
  // 단, body 자체가 null(읽기 실패)일 때는 placeholder 대신 null 유지 — 운영 진단 시
  // "본문 비었던 건지 / 마스킹된 건지" 구분 가능.
  const persistedResponseBody = params.skipResponseBody
    ? SKIPPED_RESPONSE_PLACEHOLDER
    : params.maskResponseBody
      ? responseBodyText !== null
        ? MASKED_RESPONSE_PLACEHOLDER
        : null
      : maskSensitiveFields(responseBodyText, preserveCatalogNames);

  writeLog({
    ...baseLog,
    responseStatus: response.status,
    responseBody: persistedResponseBody,
    resultCode,
    durationMs,
    errorMessage: null,
  });

  return response;
}

type LogData = {
  traceId: string;
  system: "QSP" | "SEKO";
  direction: "OUTBOUND" | "INBOUND";
  apiName: string;
  method: string;
  requestUrl: string;
  requestBody: string | null;
  responseStatus: number;
  responseBody: string | null;
  resultCode: string | null;
  durationMs: number;
  callerRoute: string;
  userId: string | null;
  userType: string | null;
  errorMessage: string | null;
  /** 진입~종료 wrapper 패턴에서 라우트 진입 시각을 명시하기 위한 override.
   *  미지정 시 DB default(`UTC_TIMESTAMP(3)`) 가 UTC 로 채운다. */
  createdAt?: Date;
};

/** fire-and-forget: 로그 insert 실패 시 console.error만 남김 */
function writeLog(data: LogData): void {
  prisma.qpInterfaceLog
    .create({ data })
    .catch((err: unknown) => {
      console.error("[interface-logger] 로그 기록 실패:", {
        traceId: data.traceId,
        apiName: data.apiName,
        error: err,
      });
    });
}

export type InboundLogParams = {
  apiName: string;
  callerRoute: string;
  method: string;
  requestUrl: string;
  responseStatus: number;
  /** INBOUND 진입 결과 — "S"(성공) / "F"(실패) / null(미정). 호출부 오타 방지 위해 union 으로 좁힘. */
  resultCode: "S" | "F" | null;
  durationMs: number;
  /** `InterfaceLogParams.userId` 와 동일 — 저장 직전 `maskUserId` 로 중앙 마스킹된다. */
  userId?: string | null;
  userType?: string | null;
  errorMessage?: string | null;
  /** 라우트 진입 시각 (wrapper 패턴에서 종료 시점에 호출되더라도 created_at 은 진입 시각이 자연스러움).
   *  미지정 시 insert 시점 = 종료 시점이 created_at 으로 기록되어, 같은 흐름 내 OUTBOUND 호출보다
   *  뒤에 정렬됨 → 사용자 진단 직관과 어긋남 (INBOUND 가 먼저 발생했음에도 OUTBOUND 가 먼저 보임). */
  createdAt?: Date;
};

/**
 * 외부 시스템 → Q.Partners INBOUND 호출 로그 기록 (`qp_interface_log`).
 *
 * 자동로그인 inbound 진입처럼 우리 측이 수신한 호출 결과를 1건 기록한다.
 *  - `system` 은 "QSP" 로 통일 — 자동로그인 흐름이 QSP 사용자 기반이라
 *    OUTBOUND `userDetail` 호출과 동일 system 으로 묶여 진단 시 일관 조회 가능.
 *  - `requestUrl` 은 `maskSensitiveQueryInUrl` 로 cipher / loginId / email 마스킹.
 *  - `userId` 는 `maskUserId` 로 중앙 마스킹 (비이메일 식별자 포함).
 *  - `errorMessage` 는 쿼리 민감값 마스킹 후 `MAX_ERROR_MSG_LENGTH` 로 절단.
 *  - GET 진입이라 `requestBody` 는 항상 null. `responseBody` 도 INBOUND 측은 의미 없어 null.
 *  - fire-and-forget — 로그 기록 실패가 본 요청 흐름을 블로킹하지 않음.
 *
 * 2026-05-20 정책 — 자동로그인 inbound 진입 단계별 실패 추적·외부 3사 호출 도달성 확인을 위해
 * outbound 와 통일하던 미기록 정책에서 변경 (INBOUND 로깅 활성).
 */
export function logInbound(params: InboundLogParams): void {
  writeLog({
    traceId: crypto.randomUUID(),
    system: "QSP",
    direction: "INBOUND",
    apiName: params.apiName,
    method: params.method,
    requestUrl: maskSensitiveQueryInUrl(params.requestUrl),
    requestBody: null,
    responseStatus: params.responseStatus,
    responseBody: null,
    resultCode: params.resultCode,
    durationMs: params.durationMs,
    callerRoute: params.callerRoute,
    // fetchWithLog 와 동일한 중앙 마스킹 (비이메일 식별자 원문 저장 차단).
    userId: params.userId != null ? maskUserId(params.userId) : null,
    userType: params.userType ?? null,
    // fetchWithLog 와 동일 처리 — 쿼리 민감값 마스킹 + 절단.
    // 절단이 없으면 VARCHAR(500) 초과 시 insert 가 깨지고 fire-and-forget 의 catch 로 흡수되어
    // INBOUND 감사 행 자체가 유실된다(외부 호출자가 로그를 침묵시킬 수 있는 경로).
    errorMessage:
      params.errorMessage != null
        ? maskSensitiveQueryInUrl(params.errorMessage).slice(
            0,
            MAX_ERROR_MSG_LENGTH,
          )
        : null,
    createdAt: params.createdAt,
  });
}
