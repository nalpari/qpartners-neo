const HTML_TAG_PATTERN = /<[a-z][^>]*>/i;

/**
 * DB에 저장된 본문(`Content.body`)을 에디터의 HTML 파서가 안전히 받을 수 있는 형태로 정규화한다.
 *
 * - null / 빈 문자열 → ""
 * - HTML 태그 미포함(legacy plain text) → 줄 단위로 split 후 각 줄을 <p>로 감싼 HTML
 * - HTML 태그 포함 → 그대로 반환 (BlockNote 시절·Tiptap 모두 자체 파서로 흡수)
 *
 * 태그 없이 entity만 있는 HTML(예: "&amp;hello")은 plain text로 분기되어 이중 escape되지만,
 * 현재 사용처(`Content.body`)에서는 발생하지 않는다.
 *
 * sanitize는 이 함수의 책임이 아니며, 렌더 경로의 sanitizeContentHtml에서 별도 수행한다.
 */
export function prepareBodyForEditor(body: string | null | undefined): string {
  if (!body) return "";

  if (HTML_TAG_PATTERN.test(body)) {
    return body;
  }

  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${escapeForParagraph(line)}</p>`)
    .join("");
}

function escapeForParagraph(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
