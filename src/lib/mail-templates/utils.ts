/** HTML 특수문자 이스케이프 (XSS 방지) */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Asia/Tokyo 기준 "YYYY年MM月DD日 HH:MM:SS" 포맷.
 * 문의 접수일·로그인 일시 등 메일 본문 일시 표기에 사용.
 */
export function formatReceivedAt(d: Date): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const obj: Record<string, string> = {};
  for (const p of parts) obj[p.type] = p.value;
  return `${obj.year}年${obj.month}月${obj.day}日 ${obj.hour}:${obj.minute}:${obj.second}`;
}
