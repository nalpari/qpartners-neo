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
