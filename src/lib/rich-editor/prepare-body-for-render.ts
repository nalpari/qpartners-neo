/**
 * 상세 페이지 본문 렌더 직전 전처리.
 *
 * - 레거시 plain-text 줄바꿈(\n)을 <br>로 변환해 시각적 줄바꿈 보존.
 * - Tiptap이 빈 단락을 `<p></p>`로 직렬화 → prose CSS에서 0 높이로 붕괴되어 빈 줄이
 *   사라지는 문제를 막기 위해 `<p><br></p>`로 정규화.
 * - Tiptap이 출력하는 td[colwidth]를 BlockNote 호환 colgroup>col[style="width:Npx"]로 변환 →
 *   detail CSS([&_table]:table-fixed)가 두 마크업에서 동일하게 동작.
 *
 * sanitize는 별도 책임이다 — 결과를 반드시 sanitizeContentHtml에 통과시킨 뒤 렌더해야 한다.
 */
export function prepareBodyForRender(body: string | null | undefined): string {
  if (!body) return "";
  const withBr = body.replace(/\n/g, "<br>");
  const withBlankParagraphs = ensureEmptyParagraphsRender(withBr);
  return normalizeTiptapTableWidths(withBlankParagraphs);
}

/**
 * 콘텐츠가 없는 `<p></p>`(공백·&nbsp; 포함)를 `<p><br></p>`로 치환한다.
 * - 속성은 보존 (`<p class="...">` 등)
 * - sanitize 단계의 ALLOWED_TAGS에 `br`이 포함되어 있어 통과한다.
 */
function ensureEmptyParagraphsRender(html: string): string {
  return html.replace(
    /<p(\s[^>]*)?>(?:\s|&nbsp;)*<\/p>/gi,
    (_match, attrs: string | undefined) => `<p${attrs ?? ""}><br></p>`,
  );
}

/**
 * Tiptap의 @tiptap/extension-table은 td/th에 colwidth 속성을 직접 단다.
 * BlockNote 시절 colgroup 기반 detail CSS가 그대로 동작하도록, 첫 행의 colwidth를
 * 모아 colgroup>col[style="width:Npx"]로 변환한다.
 *
 * - 이미 colgroup이 있는 테이블은 건너뛴다 (BlockNote 출력 또는 사전 정규화).
 * - 첫 행 셀의 colwidth만 사용한다 (Tiptap도 첫 행 기준으로만 너비를 보존).
 * - 누락/0/비숫자 colwidth → `<col>`로 두어 table-fixed에서 auto-sized로 폴백.
 *
 * 정규식 기반 — server / client 양쪽에서 동작. DOM API에 의존하지 않는다.
 */
function normalizeTiptapTableWidths(html: string): string {
  return html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (match, tableAttrs, inner) => {
    if (/<colgroup\b/i.test(inner)) return match;
    const firstRowMatch = /<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(inner);
    if (!firstRowMatch) return match;
    const firstRowInner = firstRowMatch[1];

    const widths: number[] = [];
    const cellRe = /<(?:td|th)\b([^>]*)>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(firstRowInner))) {
      const attrs = cellMatch[1];
      const widthMatch = /\bcolwidth\s*=\s*["']?(\d+)["']?/i.exec(attrs);
      const w = widthMatch ? Number(widthMatch[1]) : 0;
      widths.push(Number.isFinite(w) && w > 0 ? w : 0);
    }

    if (!widths.some((w) => w > 0)) return match;

    const cols = widths
      .map((w) => (w > 0 ? `<col style="width:${w}px">` : `<col>`))
      .join("");
    return `<table${tableAttrs}><colgroup>${cols}</colgroup>${inner}</table>`;
  });
}
