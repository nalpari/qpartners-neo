/**
 * 대량메일 공유 상수
 *
 * - ORPHAN_SEND_SENTINEL: SMTP 성공 후 DB 갱신 실패 시 errorMessage prefix.
 *   send-processor 에서 마킹, 상세 API 가 카테고리 분류 시 식별, 운영자 모달 UI 가 구분 표시.
 * - FAILURE_CATEGORY: failedRecipients 응답에 노출하는 분류 코드 (SMTP 원문 노출 금지 — 인프라 지문/email enumeration 방어).
 */

export const ORPHAN_SEND_SENTINEL = "ORPHAN_SEND:" as const;

export type FailureCategory =
  | "ORPHAN_SEND"
  | "SMTP_TIMEOUT"
  | "SMTP_REJECT"
  | "UNKNOWN";

/**
 * recipient.errorMessage (raw SMTP 응답) → 노출 가능한 분류 코드로 매핑.
 * - SMTP 응답 원문은 인프라 지문/사용자 enumeration 단서가 될 수 있어 그대로 응답에 싣지 않음.
 * - heuristic 매칭이지만 카테고리는 운영자가 후속 조치(재발송 vs 영구 실패) 판단에 충분.
 */
export function classifyFailure(message: string | null | undefined): FailureCategory {
  if (!message) return "UNKNOWN";
  if (message.startsWith(ORPHAN_SEND_SENTINEL)) return "ORPHAN_SEND";

  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("econnreset")) {
    return "SMTP_TIMEOUT";
  }
  if (
    lower.includes("rejected") ||
    lower.includes("550") ||
    lower.includes("553") ||
    lower.includes("554") ||
    lower.includes("invalid recipient") ||
    lower.includes("user unknown")
  ) {
    return "SMTP_REJECT";
  }
  return "UNKNOWN";
}

/** GET /api/admin/mass-mails/:id 의 failedRecipients 상한 (PII 노출 + 응답 크기 제어) */
export const FAILED_RECIPIENTS_RESPONSE_LIMIT = 500;
