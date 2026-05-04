/**
 * HTML 문자열이 사용자에게 보이는 텍스트(이미지·테이블 셀 포함) 없이 비어 있는지 검사한다.
 * - 모든 태그를 제거하고 &nbsp; / 공백 문자를 정리한 결과가 빈 문자열이면 빈 본문으로 본다.
 * - 단, <img> 태그가 하나라도 있으면 "내용 있음"으로 간주.
 * - 표(<table>)는 태그 구조 자체로는 내용으로 보지 않는다 — 셀(<td>/<th>) 내부 텍스트가 모두 비어 있으면 빈 본문으로 간주.
 */
export function isHtmlEmpty(html: string | null | undefined): boolean {
  if (!html) return true;

  // 이미지가 있으면 내용 있음 (이미지만으로도 의미 있음)
  if (/<img\b/i.test(html)) return false;

  // 모든 태그 제거 후 텍스트만 남김
  const stripped = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\s​]/g, ""); // ZWSP 포함 모든 공백 제거

  return stripped.length === 0;
}
