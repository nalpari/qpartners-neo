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

/**
 * SMTP 에러가 영구 실패(=retry 무의미)인지 판정.
 *
 * - 5xx 응답 (550 User unknown, 553 Mailbox not found, 554 Mail rejected 등) → 영구 실패 → retry 안 함
 * - 4xx 응답 (421 Service unavailable, 450/451/452 temporary 등) → 일시 실패 → retry 의미 있음
 * - 네트워크 에러 (ETIMEDOUT, ECONNRESET 등) → 일시 실패 → retry 의미 있음
 *
 * 판정 우선순위:
 *   1) nodemailer error.responseCode (정수, 가장 신뢰)
 *   2) RFC 3463 enhanced status code 5.x.x (예: 5.1.1)
 *   3) SMTP reply line 시작 패턴 (`550 ...`, `554-...` 등 — RFC 5321 reply-line 형식)
 *   4) 명시적 영구 거부 키워드 (영문 + 일본 ISP 응답)
 *
 * **불확실하면 false (retry 허용)** — 잘못된 영구 실패 판정으로 정상 메일이 누락되는 사고 방지.
 *
 * 좁은 정규식 사용 이유: `/\b5\d{2}\b/` 는 `"timeout 502ms"`, `"queue size 550 messages"` 등
 * 임의의 3자리 숫자에 매칭되어 일시 장애가 영구 실패로 오판정되는 false-positive 가 발생.
 * 도메인이 일본 ISP(docomo/au/softbank/biglobe 등) 다수이므로 영향 범위가 큼.
 */
export function isPermanentSmtpFailure(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "responseCode" in error) {
    const code = (error as { responseCode?: unknown }).responseCode;
    if (typeof code === "number" && code >= 500 && code < 600) return true;
    if (typeof code === "number" && code >= 400 && code < 500) return false;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");

  // RFC 3463 enhanced mail system status code — 5.x.x 형식 (예: "5.1.1 User unknown").
  // \b 경계로 "v5.1.1" 같은 버전 표기와 분리.
  if (/\b5\.\d+\.\d+\b/.test(message)) return true;

  // RFC 5321 reply-line 시작 패턴. SMTP 응답은 `<3자리>[ -]<text>` 형식 → 라인 시작에서만 매칭.
  // multiline 플래그로 라인 단위 검사. `5XX-` 는 multi-line reply 의 continuation.
  if (/^\s*5\d{2}[ -]/m.test(message)) return true;

  const lower = message.toLowerCase();
  // 표준 영구 거부 메시지 (영문)
  if (lower.includes("user unknown")) return true;
  if (lower.includes("invalid recipient")) return true;
  if (lower.includes("mailbox not found")) return true;
  if (lower.includes("mailbox unavailable")) return true;
  if (lower.includes("recipient address rejected")) return true;
  if (lower.includes("does not exist")) return true;
  if (lower.includes("no such user")) return true;

  // 일본 ISP 영구 거부 메시지 (docomo/au/softbank/biglobe/nifty 등 응답 패턴).
  // 일시 장애와 혼동 방지를 위해 명백한 거부 표현만 매칭.
  if (message.includes("ユーザーが存在しません")) return true;
  if (message.includes("該当ユーザーが見つかりません")) return true;
  if (message.includes("宛先不明")) return true;
  if (message.includes("宛先が存在しません")) return true;
  if (message.includes("メールボックスが存在しません")) return true;
  if (message.includes("メールアドレスが存在しません")) return true;
  if (message.includes("受信を拒否")) return true;
  if (message.includes("受信拒否")) return true;

  return false;
}
