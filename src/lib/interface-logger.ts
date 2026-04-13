/**
 * 외부 시스템 인터페이스 로그 유틸리티
 *
 * QSP, 시공점 등 외부 API 호출 시 qp_interface_log 테이블에 자동 기록.
 * 로그 실패 시에도 본 요청 흐름을 블로킹하지 않음 (fire-and-forget).
 */

import { prisma } from "@/lib/prisma";

export type InterfaceLogParams = {
  system: string;
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
  "newPassword",
  "currentPassword",
]);

function maskSensitiveFields(body: string | null | undefined): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return body;
    const masked = { ...parsed };
    for (const key of Object.keys(masked)) {
      if (SENSITIVE_KEYS.has(key)) {
        masked[key] = "***";
      }
    }
    return JSON.stringify(masked);
  } catch {
    return body;
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
    const parsed = JSON.parse(responseBody);
    return parsed?.result?.resultCode ?? null;
  } catch {
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

  let response: Response;
  let responseBodyText: string | null = null;
  let errorMessage: string | null = null;

  try {
    response = await fetch(url, init);

    const cloned = response.clone();
    try {
      responseBodyText = await cloned.text();
    } catch {
      // 응답 body 읽기 실패 — 무시
    }
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - startTime);
    errorMessage =
      error instanceof Error ? error.message : String(error);

    // 네트워크 에러도 로그 기록
    writeLog({
      traceId,
      system: params.system,
      direction: params.direction,
      apiName: params.apiName,
      method,
      requestUrl: maskEmailInUrl(url),
      requestBody: maskSensitiveFields(requestBody),
      responseStatus: 0,
      responseBody: null,
      resultCode: "F",
      durationMs,
      callerRoute: params.callerRoute,
      userId: params.userId ?? null,
      userType: params.userType ?? null,
      errorMessage,
    });

    throw error;
  }

  const durationMs = Math.round(performance.now() - startTime);
  const resultCode = extractResultCode(responseBodyText);

  writeLog({
    traceId,
    system: params.system,
    direction: params.direction,
    apiName: params.apiName,
    method,
    requestUrl: maskEmailInUrl(url),
    requestBody: maskSensitiveFields(requestBody),
    responseStatus: response.status,
    responseBody: responseBodyText,
    resultCode,
    durationMs,
    callerRoute: params.callerRoute,
    userId: params.userId ?? null,
    userType: params.userType ?? null,
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
      console.error("[interface-logger] 로그 기록 실패:", err);
    });
}
