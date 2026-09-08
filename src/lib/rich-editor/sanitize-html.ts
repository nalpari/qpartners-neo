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

// 텍스트 컬러/하이라이트/폰트 사이즈 보존용 —
//   <span style="color: …">, <span style="font-size: 18px">,
//   <mark style="background-color: …; color: inherit"> 등.
// Tiptap highlight(multicolor)는 background-color와 color: inherit를 함께 직렬화하므로
// 다중 declaration을 ';'로 분리해서 각각 검증한다.
// color/bg 허용 값: hex / keyword(inherit·transparent) / rgb·rgba·hsl·hsla 함수형.
//   브라우저가 inline style을 IDL로 읽을 때 rgb(...) 로 normalize 하는 경로가 있어
//   hex 외 함수형도 통과시켜야 mark/span의 style 속성이 통째로 떨어지지 않는다.
//   괄호 내부는 영숫자·공백·`,.%-` 외 문자 차단 — `;<>"'()\` 등 주입 우회 봉쇄.
// font-size는 SPAN에만 허용하며 `\d{1,3}px` 형식만 통과 (font-size.ts:FONT_SIZE_OPTIONS와 한 묶음 정책).
const SPAN_MARK_STYLE_ALLOWED_TAGS = new Set(["SPAN", "MARK"]);
const SPAN_ALLOWED_STYLE_PROPS = new Set(["color", "background-color", "font-size"]);
const MARK_ALLOWED_STYLE_PROPS = new Set(["color", "background-color"]);
const SAFE_COLOR_VALUE_PATTERN =
  /^(?:#[0-9a-f]{3,8}|inherit|transparent|(?:rgba?|hsla?)\(\s*[0-9a-z\s,.%\-]+\s*\))$/i;
const SAFE_FONT_SIZE_VALUE_PATTERN = /^\d{1,3}px$/i;

function isSafeSpanMarkStyle(tagName: string, value: string): boolean {
  const allowedProps =
    tagName === "SPAN" ? SPAN_ALLOWED_STYLE_PROPS : MARK_ALLOWED_STYLE_PROPS;
  const decls = value.split(";").map((s) => s.trim()).filter(Boolean);
  if (decls.length === 0) return false;
  for (const decl of decls) {
    const idx = decl.indexOf(":");
    if (idx < 0) return false;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!allowedProps.has(prop)) return false;
    if (prop === "font-size") {
      if (!SAFE_FONT_SIZE_VALUE_PATTERN.test(val)) return false;
    } else {
      if (!SAFE_COLOR_VALUE_PATTERN.test(val)) return false;
    }
  }
  return true;
}

// ─── YouTube 임베드 (opt-in) ───
// iframe 은 기본 차단이다. 임의 도메인 iframe 은 클릭재킹·피싱 UI 삽입 벡터이고,
// 이 파일의 다른 화이트리스트(href/img src/style/class)를 좁혀둔 방침과도 어긋난다.
// 콘텐츠 본문 경로에서만 `allowYoutubeEmbed` 로 열고, 그때도 YouTube embed URL 만 통과시킨다.
// 메일 경로는 계속 차단 — 메일 클라이언트가 iframe 을 대부분 렌더하지 않아 허용해도 의미가 없다.
const YOUTUBE_EMBED_TAGS = ["iframe"];
const YOUTUBE_EMBED_ATTR = [
  "allowfullscreen",
  "frameborder",
  "allow",
  "referrerpolicy",
  "width",
  "height",
  // Tiptap Youtube extension 이 iframe 을 감싸는 래퍼 <div data-youtube-video>
  "data-youtube-video",
];
/**
 * youtube.com / youtube-nocookie.com 의 `/embed/{11자 videoId}` 만 허용.
 * query string 은 start·rel·si 등 파라미터 보존용으로 제한된 문자셋만 통과시킨다.
 *
 * editor-extensions.ts 의 Youtube parseHTML 도 이 패턴을 재사용한다 —
 * "sanitize 는 통과했는데 에디터가 파싱을 거부" 하는 판정 불일치를 막기 위한 단일 출처.
 */
export const SAFE_YOUTUBE_SRC_PATTERN =
  /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}(?:\?[A-Za-z0-9_=&%.,-]*)?$/;
// iframe 크기 — 숫자만. `100%` 등 단위 표기는 레이아웃 위조 여지가 있어 제외하고 CSS 로 처리한다.
const SAFE_IFRAME_DIMENSION_PATTERN = /^\d{1,4}$/;

// <input> 화이트리스트 — 체크리스트 fallback 표시용. 그 외 type은 element 자체 제거.
const SAFE_INPUT_TYPES = new Set(["checkbox"]);

// `colwidth` 화이트리스트 — Tiptap 표 셀이 부여하는 비표준 속성.
//   - 단일 컬럼: `<td colwidth="120">`
//   - colspan>1 셀: `<td colwidth="120,80">`
// 외부 메일 클라이언트 렌더링 안전성을 위해 숫자(또는 쉼표 구분 숫자 리스트) 만 허용.
const SAFE_COLWIDTH_PATTERN = /^\d+(?:,\d+)*$/;
const COLWIDTH_ALLOWED_TAGS = new Set(["TD", "TH"]);

// class 속성 화이트리스트 — Tiptap extensions 가 부여하는 식별용 클래스만 허용.
// UI 위조 / CSS injection 벡터 차단을 위해 임의 class 통과 금지.
//   - rich-editor-inline-image / rich-editor-table : editor-extensions.ts HTMLAttributes
//   - language-* : 코드블록 syntax highlight(향후 도입 시)
//   - bn-* : 레거시 BlockNote 본문(체크리스트·블록 식별 등) — 기존 콘텐츠 detail 렌더링 회귀 방지
const SAFE_CLASS_VALUE_PATTERN = /^(?:rich-editor-[\w-]+|language-[\w-]+|bn-[\w-]+)$/;

function isSafeClassValue(value: string): boolean {
  const tokens = value.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => SAFE_CLASS_VALUE_PATTERN.test(token));
}

let hooksRegistered = false;

// 훅은 1회만 등록되므로 호출별 옵션을 인자로 받을 수 없다.
// DOMPurify.sanitize 는 동기 실행이라 호출 직전 세팅 → finally 리셋으로 안전하게 전달된다.
let allowYoutubeEmbedForCurrentCall = false;

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
    // inline style — 표 관련 태그의 width/height,
    //   span의 color/background-color/font-size, mark의 color/background-color만 허용
    if (data.attrName === "style") {
      const tagName = node.tagName;
      const isTableStyle =
        STYLE_ALLOWED_TAGS.has(tagName) && SAFE_TABLE_STYLE_PATTERN.test(data.attrValue);
      const isSpanMarkStyle =
        SPAN_MARK_STYLE_ALLOWED_TAGS.has(tagName) &&
        isSafeSpanMarkStyle(tagName, data.attrValue);
      if (!isTableStyle && !isSpanMarkStyle) {
        data.keepAttr = false;
      }
    }
    // class 화이트리스트 — Tiptap 식별용 클래스(rich-editor-* / language-*) 외 통째 제거.
    if (data.attrName === "class") {
      if (!isSafeClassValue(data.attrValue)) {
        data.keepAttr = false;
      }
    }
    // iframe[src] — YouTube embed 화이트리스트. 불일치 시 속성 제거하고,
    // uponSanitizeElement 에서 element 자체도 제거한다 (src 없는 빈 iframe 잔존 방지).
    if (node.tagName === "IFRAME" && data.attrName === "src") {
      if (!SAFE_YOUTUBE_SRC_PATTERN.test(data.attrValue)) {
        data.keepAttr = false;
      }
    }
    // width/height — iframe 전용. 다른 태그에 붙으면 레이아웃 위조 여지가 있어 제거한다.
    if (data.attrName === "width" || data.attrName === "height") {
      const validTag = node.tagName === "IFRAME";
      const validValue = SAFE_IFRAME_DIMENSION_PATTERN.test(data.attrValue);
      if (!validTag || !validValue) {
        data.keepAttr = false;
      }
    }
    // colwidth — TD/TH 에만 허용 + 값은 숫자(또는 쉼표 구분 숫자) 만 통과.
    if (data.attrName === "colwidth") {
      const validTag = COLWIDTH_ALLOWED_TAGS.has(node.tagName);
      const validValue = SAFE_COLWIDTH_PATTERN.test(data.attrValue);
      if (!validTag || !validValue) {
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
    // <iframe>은 allowYoutubeEmbed 경로에서 YouTube embed src 인 것만 통과.
    // ALLOWED_TAGS 로도 걸러지지만, src 불일치로 속성만 떨어진 빈 iframe 을 남기지 않기 위해
    // element 단위로 한 번 더 판정한다.
    if (data.tagName === "iframe") {
      const el = node as Element;
      const src = el.getAttribute?.("src") ?? "";
      if (!allowYoutubeEmbedForCurrentCall || !SAFE_YOUTUBE_SRC_PATTERN.test(src)) {
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

export interface SanitizeContentHtmlOptions {
  /**
   * YouTube 임베드 iframe 허용 여부 (기본 false).
   *
   * 콘텐츠 본문 경로(에디터 HTML 소스 적용 / 콘텐츠 상세 렌더)에서만 true 로 켠다.
   * 대량메일 경로는 false 를 유지한다 — 메일 클라이언트가 iframe 을 대부분 차단하므로
   * 허용해도 수신자에게 보이지 않고, 허용 표면만 넓어진다.
   */
  allowYoutubeEmbed?: boolean;
}

/**
 * 사용자 본문 HTML(BlockNote/Tiptap 출력 또는 레거시)을 렌더 안전한 HTML로 정제한다.
 * - 허용 태그·속성 외 제거
 * - 인라인 style: 표 관련 태그의 width·height 만 허용
 * - 위험한 href/src 스킴 제거
 * - <input>은 type="checkbox"만 통과 (그 외 element 제거)
 * - target=_blank 링크에 rel=noopener noreferrer 부여
 * - <iframe>은 기본 차단. `allowYoutubeEmbed` 시에만 YouTube embed URL 에 한해 통과
 */
export function sanitizeContentHtml(
  html: string | null | undefined,
  options?: SanitizeContentHtmlOptions,
): string {
  if (!html) return "";
  const allowYoutubeEmbed = options?.allowYoutubeEmbed === true;
  try {
    ensureHooksRegistered();
    allowYoutubeEmbedForCurrentCall = allowYoutubeEmbed;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowYoutubeEmbed
        ? [...ALLOWED_TAGS, ...YOUTUBE_EMBED_TAGS]
        : ALLOWED_TAGS,
      ALLOWED_ATTR: allowYoutubeEmbed
        ? [...ALLOWED_ATTR, ...YOUTUBE_EMBED_ATTR]
        : ALLOWED_ATTR,
      // 임의 data-* 통과 차단 — 필요한 data-type / data-checked / data-language 는 ALLOWED_ATTR 에 명시.
      ALLOW_DATA_ATTR: false,
      // 임의 aria-* 통과 차단 — Tiptap 출력은 ARIA 를 본문 노드에 부착하지 않음(툴바/팝오버 한정),
      // 메일 발송 경로에서 스크린리더 조작 / UX 변조 벡터를 사전 차단.
      ALLOW_ARIA_ATTR: false,
    });
  } catch (error: unknown) {
    console.error("[sanitizeContentHtml] sanitize 실패:", error);
    return "";
  } finally {
    // 다음 호출이 기본(차단) 상태로 시작하도록 반드시 되돌린다 — 옵션 누수 시
    // 메일 경로에서 iframe 이 통과하게 된다.
    allowYoutubeEmbedForCurrentCall = false;
  }
}
