import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "a",
  "strong",
  "em",
  "u",
  "s",
  "br",
  "span",
  "div",
];

const ALLOWED_ATTR = [
  "class",
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
  "colwidth",
  "style",
  "target",
  "rel",
];

const SAFE_HREF_PATTERN = /^(https?:|mailto:|#)/i;
const SAFE_IMG_SRC_PATTERN = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i;

// 표 컬럼 너비 보존용 — BlockNote가 출력하는 `<col style="width: Npx">` 만 허용한다.
// 다른 inline style 을 허용하면 XSS(예: `expression(...)`, `background:url(javascript:...)`) 위험이 있으므로
// 안전 패턴을 화이트리스트한다. 단위는 px만 허용 (BlockNote가 px만 emit).
const SAFE_TABLE_STYLE_PATTERN =
  /^\s*(?:(?:min-)?(?:width|height)\s*:\s*\d+(?:\.\d+)?px\s*;?\s*)+$/i;
const STYLE_ALLOWED_TAGS = new Set(["COL", "COLGROUP", "TABLE", "TD", "TH", "TR"]);

let hooksRegistered = false;

function ensureHooksRegistered(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    // a[href] 화이트리스트
    if (node.tagName === "A" && data.attrName === "href") {
      if (!SAFE_HREF_PATTERN.test(data.attrValue)) {
        data.keepAttr = false;
      }
    }
    // img[src] 화이트리스트
    if (node.tagName === "IMG" && data.attrName === "src") {
      if (!SAFE_IMG_SRC_PATTERN.test(data.attrValue)) {
        data.keepAttr = false;
      }
    }
    // inline style — 표 관련 태그의 width/height 류만 허용 (그 외 전부 제거)
    if (data.attrName === "style") {
      if (!STYLE_ALLOWED_TAGS.has(node.tagName) || !SAFE_TABLE_STYLE_PATTERN.test(data.attrValue)) {
        data.keepAttr = false;
      }
    }
  });

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // a[target=_blank]에 noopener noreferrer 강제
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * 사용자 본문 HTML(BlockNote 출력 또는 레거시 데이터)을 렌더 안전한 HTML로 정제한다.
 * - 허용 태그·속성 외 제거
 * - 인라인 style: 표 관련 태그(col/colgroup/table/td/th/tr)의 width·height 만 허용
 * - 위험한 href/src 스킴 제거
 * - target=_blank 링크에 rel=noopener noreferrer 부여
 */
export function sanitizeContentHtml(html: string | null | undefined): string {
  if (!html) return "";
  try {
    ensureHooksRegistered();
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: true,
    });
  } catch (error: unknown) {
    // sanitize는 렌더 직전에 호출되므로 throw가 페이지 전체 크래시로 이어진다.
    // dompurify는 string 입력에 거의 throw하지 않지만, 방어적으로 빈 본문으로 폴백한다.
    console.error("[sanitizeContentHtml] sanitize 실패:", error);
    return "";
  }
}
