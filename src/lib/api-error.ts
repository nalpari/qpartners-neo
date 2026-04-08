import { isAxiosError } from "axios";

/** API 에러 응답에서 error 문자열을 안전하게 추출 (unknown → string | undefined) */
export function extractApiError(error: unknown): string | undefined {
  if (!isAxiosError(error) || !error.response) return undefined;
  const body: unknown = error.response.data;
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body
  ) {
    const msg = (body as Record<string, unknown>).error;
    if (typeof msg === "string") return msg;
  }
  return undefined;
}
