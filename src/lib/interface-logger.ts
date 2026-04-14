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
]);

const EMAIL_KEYS = new Set(["email"]);

export function maskEmail(value: string): string {
  const atIdx = value.indexOf("@");
  if (atIdx <= 0) return value;
  return value[0] + "***" + value.slice(atIdx);
}

const MAX_BODY_LENGTH = 8_000;

function truncateBody(text: string | null): string | null {
  if (!text) return null;
  if (text.length <= MAX_BODY_LENGTH) return text;
  return text.slice(0, MAX_BODY_LENGTH) + "...[truncated]";
}

function maskObjectFields(obj: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] = "***";
    } else if (EMAIL_KEYS.has(key) && typeof val === "string") {
      masked[key] = maskEmail(val);
    } else if (Array.isArray(val)) {
      masked[key] = val.map((item) =>
        typeof item === "object" && item !== null
          ? maskObjectFields(item as Record<string, unknown>)
          : item,
      );
    } else if (typeof val === "object" && val !== null) {
      masked[key] = maskObjectFields(val as Record<string, unknown>);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

function maskSensitiveFields(body: string | null | undefined): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return truncateBody(body);
    const masked = maskObjectFields(parsed as Record<string, unknown>);
    return truncateBody(JSON.stringify(masked));
  } catch (error: unknown) {
    console.warn("[InterfaceLogger] JSON 파싱 실패 — 원본 반환:", error);
    return truncateBody(body);
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
    if (typeof parsed === "object" && parsed !== null) {
      const result = (parsed as Record<string, unknown>).result;
      if (typeof result === "object" && result !== null) {
        const code = (result as Record<string, unknown>).resultCode;
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
      errorMessage: rawMsg.slice(0, 490),
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
  system: string;
  direction: string;
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
