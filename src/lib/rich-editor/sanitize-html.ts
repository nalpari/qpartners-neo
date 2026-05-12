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
  "mark",
  "div",
  // BlockNote 시절 체크리스트 fallback 표시용. Tiptap 본 마이그레이션은
  // 신규 입력은 차단하지만, 기존 콘텐츠가 detail 에서 깨지지 않게 유지.
  "label",
  "input",
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
  // Tiptap 마크업
  "data-type",
  "data-checked",
  "data-language",
  // <input type="checkbox"> fallback
  "type",
  "checked",
  "disabled",
];

const SAFE_HREF_PATTERN = /^(https?:|mailto:|#)/i;
// 본문 임베드 이미지: `/api/inline-images/{id}` 절대 경로
//   - 다른 상대 경로는 차단 — 임의 경로 src 우회 방지
const SAFE_IMG_SRC_PATTERN =
  /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,|\/api\/inline-images\/\d+$)/i;

// 표 컬럼 너비 보존용 — `<col style="width: Npx">` 등 표 관련 너비 inline style만 허용한다.
const SAFE_TABLE_STYLE_PATTERN =
  /^\s*(?:(?:min-)?(?:width|height)\s*:\s*\d+(?:\.\d+)?px\s*;?\s*)+$/i;
const STYLE_ALLOWED_TAGS = new Set(["COL", "COLGROUP", "TABLE", "TD", "TH", "TR"]);

// 텍스트 컬러/하이라이트 보존용 — <span style="color: …"> /
//   <mark style="background-color: …; color: inherit"> 등.
// Tiptap highlight(multicolor)는 background-color와 color: inherit를 함께 직렬화하므로
// 다중 declaration을 ';'로 분리해서 각각 검증한다.
// 허용 값: hex / keyword(inherit·transparent) / rgb·rgba·hsl·hsla 함수형.
//   브라우저가 inline style을 IDL로 읽을 때 rgb(...) 로 normalize 하는 경로가 있어
//   hex 외 함수형도 통과시켜야 mark/span의 style 속성이 통째로 떨어지지 않는다.
//   괄호 내부는 영숫자·공백·`,.%-` 외 문자 차단 — `;<>"'()\` 등 주입 우회 봉쇄.
const COLOR_STYLE_ALLOWED_TAGS = new Set(["SPAN", "MARK"]);
const SAFE_COLOR_PROPS = new Set(["color", "background-color"]);
const SAFE_COLOR_VALUE_PATTERN =
  /^(?:#[0-9a-f]{3,8}|inherit|transparent|(?:rgba?|hsla?)\(\s*[0-9a-z\s,.%\-]+\s*\))$/i;

function isSafeColorStyle(value: string): boolean {
  const decls = value.split(";").map((s) => s.trim()).filter(Boolean);
  if (decls.length === 0) return false;
  for (const decl of decls) {
    const idx = decl.indexOf(":");
    if (idx < 0) return false;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!SAFE_COLOR_PROPS.has(prop)) return false;
    if (!SAFE_COLOR_VALUE_PATTERN.test(val)) return false;
  }
  return true;
}

// <input> 화이트리스트 — 체크리스트 fallback 표시용. 그 외 type은 element 자체 제거.
const SAFE_INPUT_TYPES = new Set(["checkbox"]);

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
    // input[type] — checkbox만 허용. 다른 type은 속성 제거 후 element도 hook에서 제거.
    if (node.tagName === "INPUT" && data.attrName === "type") {
      if (!SAFE_INPUT_TYPES.has(data.attrValue.toLowerCase())) {
        data.keepAttr = false;
      }
    }
    // inline style — 표 관련 태그의 width/height, span·mark의 color/background-color만 허용
    if (data.attrName === "style") {
      const tagName = node.tagName;
      const isTableStyle =
        STYLE_ALLOWED_TAGS.has(tagName) && SAFE_TABLE_STYLE_PATTERN.test(data.attrValue);
      const isColorStyle =
        COLOR_STYLE_ALLOWED_TAGS.has(tagName) && isSafeColorStyle(data.attrValue);
      if (!isTableStyle && !isColorStyle) {
        data.keepAttr = false;
      }
    }
  });

  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    // <input>은 type=checkbox만 통과. type 누락/다른 type은 element 자체 제거.
    if (data.tagName === "input") {
      const el = node as Element;
      const t = el.getAttribute?.("type")?.toLowerCase();
      if (!t || !SAFE_INPUT_TYPES.has(t)) {
        el.parentNode?.removeChild(el);
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
 * 사용자 본문 HTML(BlockNote/Tiptap 출력 또는 레거시)을 렌더 안전한 HTML로 정제한다.
 * - 허용 태그·속성 외 제거
 * - 인라인 style: 표 관련 태그의 width·height 만 허용
 * - 위험한 href/src 스킴 제거
 * - <input>은 type="checkbox"만 통과 (그 외 element 제거)
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
    console.error("[sanitizeContentHtml] sanitize 실패:", error);
    return "";
  }
}
