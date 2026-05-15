/** 날짜를 YYYY.MM.DD 형식으로 포맷. invalid/빈 값은 "-" 반환 (NaN.NaN.NaN 방어). */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** 날짜를 YYYY-MM-DD 형식으로 포맷 (ISO 날짜 부분만) */
export function formatDateISO(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

/**
 * 사용자 표시명 정규화 — "姓 名" (반각공백) 형태로 통일.
 *
 * QSP `userNm` 합본은 "山田 太郎" / "山田　太郎" / "山田, 太郎" / "山田,太郎" 등 다양한
 * 구분자로 내려올 수 있어 표시 시점에 통일이 필요. 콤마/공백/전각공백을 한 토큰 구분자로
 * 보고 앞 2 토큰만 반각공백으로 결합한다. 단일어는 그대로 반환.
 *
 * - null/빈문자열 → ""
 * - 양 끝 trim
 */
export function formatUserDisplayName(userNm: string | null | undefined): string {
  if (!userNm) return "";
  const tokens = userNm.split(/[\s　,]+/).filter(Boolean);
  if (tokens.length === 0) return "";
  return tokens.slice(0, 2).join(" ");
}
