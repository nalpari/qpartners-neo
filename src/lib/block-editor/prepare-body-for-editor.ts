const HTML_TAG_PATTERN = /<[a-z][^>]*>/i;

/**
 * DB에 저장된 본문(`Content.body`)을 BlockNote `tryParseHTMLToBlocks`가 안전히 받을 수 있는 HTML로 정규화한다.
 *
 * - null / 빈 문자열 → ""
 * - HTML 태그 미포함(legacy plain text) → 줄 단위로 split 후 각 줄을 <p>로 감싼 HTML
 * - HTML 태그 포함 → 그대로 반환
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
