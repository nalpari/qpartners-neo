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
  userId?: string;
  userType?: string;
  /**
   * true 지정 시 응답 본문 전체를 `[masked:cipher-response]` 로 치환하여 저장.
   * 응답 객체 안에 `userId` 키 등으로 cipher / 토큰이 포함되는 API 전용
   * (예: QSP autoLoginEncryptData — 응답 `data.userId` 가 base64 cipher).
   * SENSITIVE_KEYS / EMAIL_KEYS 의 키 단위 마스킹으로는 누락되는 케이스를 fail-closed 로 차단.
   */
  maskResponseBody?: boolean;
};

const MASKED_RESPONSE_PLACEHOLDER = "[masked:cipher-response]";

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

// ─ 제외: `deptNm`/`pstnNm`
//   부서·직위 "명칭" 은 개인정보가 아니라 코드 카탈로그 값이다. 특히 `deptNm` 은 부서 마스터
//   조회(`apiName: "deptList"`)의 정상 응답 필드로, 스키마가 `{ deptCd, deptNm }` 만 담는다
//   (`src/lib/schemas/master.ts`). 전역 키 마스킹에 넣으면 `{ deptCd: "001", deptNm: "***" }`
//   가 되어 개인정보 보호 효과 없이 진단 가치만 사라진다.
//   782e11b 에서 `reason` 을 regex 에서 제거한 것과 동일한 false-positive 패턴이다.
//
//   **감수하는 부작용**: 두 키는 마스터 카탈로그 전용이 아니다. 회원가입·마이페이지의
//   부서/직위는 자유기입(schemas/signup.ts·mypage.ts)이라 개인의 소속이 평문으로 남는다.
//   단독 식별력은 낮지만 마스킹된 성명과 결합하면 재식별 보조가 될 수 있다.
//   근본 해결은 maskObjectFields 가 apiName 을 받아 `deptList` 에서만 제외하는 것이나,
//   현재 시그니처로는 전역 on/off 뿐이라 카탈로그 진단을 살리는 쪽을 택했다.

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
    } else if (USER_ID_KEYS.has(key) && typeof val === "string") {
      masked[key] = maskUserId(val);
    } else if (EMAIL_KEYS.has(key) && typeof val === "string") {
      masked[key] = maskEmail(val);
    } else if (Array.isArray(val)) {
      masked[key] = val.map((item) =>
        isRecord(item) ? maskObjectFields(item, depth + 1) : item,
      );
    } else if (isRecord(val)) {
      masked[key] = maskObjectFields(val, depth + 1);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

// regex fallback — JSON 파싱 실패 경로에서만 동작하므로 false-positive 를 낮춘다.
// `reason` 은 범용 키명이라 향후 다른 API(반품/거절 사유 등)에서 디버깅 방해 가능 → 전용 네임스페이스 키만 유지.
// SENSITIVE_KEYS (객체 레벨) 에는 `reason` 이 남아 있어 JSON 파싱 성공 경로에서 1차 방어 동작.
// 값 부분은 **문자열과 숫자를 모두** 매칭한다 — zipcode/telNo 가 int 로 오는 사례가 있어
// 문자열만 잡으면 파싱 실패 경로에서 그대로 평문 저장된다.
// 키 목록 불변식: (SENSITIVE_KEYS − `reason`) ∪ PII_KEYS ∪ EMAIL_KEYS ∪ USER_ID_KEYS.
//   `reason` 은 위 근거대로 **의도적으로 제외**한다 — 되돌려 넣으면 782e11b 의 수정이 무효화된다.
//   EMAIL_KEYS/USER_ID_KEYS 는 객체 경로에서 부분 마스킹(`ab***@x.com`)이지만 이 폴백에서는 전체 치환된다 —
//   파싱이 실패한 본문은 구조를 신뢰할 수 없어 더 보수적으로 가린다. 누락보다 과잉이 안전하다.
//   그 외 키를 한쪽에만 추가하면 파싱 성공/실패 경로에서 마스킹이 갈리므로 함께 고칠 것.
const SENSITIVE_PATTERN =
  /("(?:pwd|password|newPwd|curPwd|chgPwd|newPassword|currentPassword|token|accessToken|refreshToken|resignRsn|resignRemark|userNm|userNmKana|user1stNm|user2ndNm|user1stNmKana|user2ndNmKana|uptNm|sei|mei|seiKana|meiKana|compNm|compNmKana|storeName|storeNameKana|compAddr|compAddr2|compPostCd|address1|address2|zipcode|compTelNo|compFaxNo|telNo|fax|compBizNo|bizNo|corporateNo|sekoId|email|loginId|userId|updBy)"\s*:\s*)(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?)/gi;

function maskSensitiveFields(body: string | null | undefined): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) {
      const masked = maskObjectFields(parsed);
      return truncateBody(JSON.stringify(masked));
    }
    if (Array.isArray(parsed)) {
      const masked = parsed.map((item) =>
        isRecord(item) ? maskObjectFields(item) : item,
      );
      return truncateBody(JSON.stringify(masked));
    }
    return truncateBody(body);
  } catch (error: unknown) {
    console.warn("[InterfaceLogger] JSON 파싱 실패 — regex fallback 마스킹:", error);
    const fallback = body.replace(SENSITIVE_PATTERN, '$1"***"');
    return truncateBody(fallback);
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
  ...[...PII_KEYS, ...USER_ID_KEYS].map((key) => key.toLowerCase()),
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
  } catch (error: unknown) {
    console.warn("[InterfaceLogger] resultCode 추출 실패:", error);
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

  const baseLog = {
    traceId,
    system: params.system,
    direction: params.direction,
    apiName: params.apiName,
    method,
    requestUrl: maskSensitiveQueryInUrl(url),
    requestBody: maskSensitiveFields(requestBody),
    callerRoute: params.callerRoute,
    userId: params.userId ?? null,
    userType: params.userType ?? null,
  };

  let response: Response;
  let responseBodyText: string | null = null;

  try {
    // 전 호출자의 cache 전략은 호출 지점에서 명시(호출 지점 가시성 + 전역 부수효과 회피).
    // 외부 API 호출은 호출부에서 `cache: "no-store"` 을 명시하는 것을 원칙으로 함.
    response = await fetch(url, init);

    const cloned = response.clone();
    try {
      responseBodyText = await cloned.text();
    } catch (error: unknown) {
      console.warn("[InterfaceLogger] 응답 body 읽기 실패:", error);
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
  const persistedResponseBody = params.maskResponseBody
    ? responseBodyText !== null
      ? MASKED_RESPONSE_PLACEHOLDER
      : null
    : maskSensitiveFields(responseBodyText);

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
    userId: params.userId ?? null,
    userType: params.userType ?? null,
    errorMessage: params.errorMessage ?? null,
    createdAt: params.createdAt,
  });
}
