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
};

const SENSITIVE_KEYS = new Set([
  "pwd",
  "password",
  "newPwd",
  "curPwd",
  "chgPwd",
  "newPassword",
  "currentPassword",
  // 사용자 자유기입 PII 가능 — 탈퇴 사유(유저 불만·개인정보 혼입 가능)
  "resignRsn",
  "resignRemark",
  "reason",
]);

// loginId: GENERAL 회원의 경우 userId === email 이므로 이메일 주소가 그대로 로그에 남는다.
// EMAIL_KEYS 로 마스킹해 GENERAL/ADMIN/STORE 모두 공통 처리.
const EMAIL_KEYS = new Set(["email", "loginId"]);

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
const SENSITIVE_PATTERN =
  /("(?:pwd|password|newPwd|curPwd|chgPwd|newPassword|currentPassword|resignRsn|resignRemark)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;

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

function maskEmailInUrl(url: string): string {
  return url.replace(
    /email=([^&]+)/gi,
    (_match, email: string) => {
      const decoded = decodeURIComponent(email);
      const atIdx = decoded.indexOf("@");
      if (atIdx <= 0) return `email=${email}`;
      const masked = decoded[0] + "***" + decoded.slice(atIdx);
      return `email=${encodeURIComponent(masked)}`;
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
    requestUrl: maskEmailInUrl(url),
    requestBody: maskSensitiveFields(requestBody),
    callerRoute: params.callerRoute,
    userId: params.userId ?? null,
    userType: params.userType ?? null,
  };

  let response: Response;
  let responseBodyText: string | null = null;

  try {
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
      errorMessage: rawMsg.slice(0, MAX_ERROR_MSG_LENGTH),
    });

    throw error;
  }

  const durationMs = Math.round(performance.now() - startTime);
  const resultCode = extractResultCode(responseBodyText);

  writeLog({
    ...baseLog,
    responseStatus: response.status,
    responseBody: maskSensitiveFields(responseBodyText),
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
