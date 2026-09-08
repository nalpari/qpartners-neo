import { sekoBaseUrl } from "@/lib/seko-connector";

/**
 * 시공점 영수증(No.5 fileDownload `fileType=RECEIPT`) HTML 의 **자산 인라인화**.
 *
 * AS-IS 는 영수증만 `text/html` 로 내려준다(시공증명서 CERT1 은 `application/pdf`). 그 HTML 은
 * 4KB 짜리 조각이고 스타일시트·로고·도장은 AS-IS 서버 자산을 참조한다. 그대로 다운로드하면
 * 사용자 PC 에서 열 때 CSS·이미지가 붙지 않아 스타일 없는 텍스트 나열로 보인다(Redmine #2481).
 *
 * 그래서 TO-BE 가 자산을 대신 받아 **자기완결 HTML** 로 만들어 내려준다. AS-IS 원본의 마크업과
 * CSS 를 그대로 쓰므로 결과물은 AS-IS 화면과 동일하다 — 우리가 영수증을 다시 그리는 것이 아니다.
 *
 * 실패는 전부 **원본 유지**로 접는다(`null` 반환). 영수증이 보기 좋아지는 것보다 다운로드가
 * 되는 것이 우선이고, 원본 바이트는 그 자체로 유효한 문서다.
 *
 * ## preview 실측 (2026-08-24)
 * 원본 HTML 3,971 bytes / 외부 참조 4종. 전부 커넥터 origin 내부 상대경로이며 무인증 200:
 *  - `/assets/styles/styles.css`                     635,856 B — 유일한 스타일시트
 *  - `/assets/images/mypage/id/receipt/corp_logo.png`  5,502 B — 본문 `<img>`
 *  - `/assets/images/mypage/id/receipt/stamp.png`     18,871 B — **CSS `content: url()`**
 *  - JS 3종(사내 common.js / svg4everybody / 외부 CDN ajaxzip3.github.io) — 렌더 불필요
 * 결과물 약 672KB.
 */

/** 자산 1건 상한. styles.css(약 621KB)를 통과시키면서 폰트·동영상 유입은 막는 선. */
const MAX_ASSET_BYTES = 1_500_000;

/** 인라인 총량 상한. 초과분은 참조를 그대로 남긴다(해당 자산만 안 보인다). */
const MAX_TOTAL_INLINE_BYTES = 4_000_000;

/** 자산 fetch 타임아웃. 커넥터 API(10초)보다 짧게 둔다 — 자산은 정적 파일이다. */
const ASSET_TIMEOUT_MS = 5_000;

/** data: URI 로 임베드할 이미지 확장자. 폰트(eot/ttf/woff)는 영수증이 쓰지 않아 제외한다. */
const INLINE_IMAGE_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

/**
 * 다운로드 문서 레이아웃을 AS-IS **데스크톱(>1240px)** 기준으로 고정하는 오버라이드.
 *
 * `styles.css` 에는 `@media screen and (max-width: 1240px)` 블록이 있어, 창이 그보다 좁으면
 * `.receipt_footer` 가 flex → block 으로 바뀌며 내역과 회사정보가 위아래로 쌓이고 로고·회사명이
 * 가운데 정렬된다. 화면이라면 반응형이 맞지만, 다운로드 문서는 보는 창 크기와 무관하게 항상
 * 같은 모양이어야 하므로 데스크톱 값을 뒤에서 다시 선언해 우선순위로 이긴다
 * (미디어쿼리를 파싱해 제거하는 방식은 CSS 구조가 바뀌면 조용히 깨진다).
 */
const LAYOUT_OVERRIDE_CSS = `
/* TO-BE: 다운로드 문서 레이아웃 고정 (Redmine #2481) */
.wrapper { min-width: 1240px; }
.contents { width: 1200px; margin: 35px auto 0; padding: 0; }
.main-wide { width: 1040px; margin: 45px auto 0; float: none; }
.receipt { padding: 15px; }
.receipt_footer { display: flex; justify-content: space-between; }
.receipt_detail { flex: 0 0 auto; }
.receipt_corp { flex: 0 0 auto; margin: 0 0 0 30px; }
.receipt_logo { text-align: left; }
.receipt_corpName { text-align: center; }
`;

type AssetBudget = { remaining: number };

/** 커넥터 origin 안쪽으로 해석되는 절대 URL 만 돌려준다. 밖이면 `null`. */
function resolveAssetUrl(rawUrl: string, relativeTo: string): string | null {
  const base = sekoBaseUrl();
  let baseOrigin: string;
  try {
    baseOrigin = new URL(base).origin;
  } catch {
    return null;
  }
  try {
    // CSS 안의 `url(../images/...)` 는 **CSS 파일 위치** 기준이다. HTML 기준으로 풀면
    // `/assets/styles/../images` 가 아니라 `/images` 가 되어 전부 404 가 된다.
    const resolved = new URL(rawUrl, relativeTo);
    return resolved.origin === baseOrigin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/** 자산 1건 fetch. 실패·상한 초과는 `null`(호출부가 원래 참조를 그대로 남긴다). */
async function fetchAsset(
  url: string,
  token: string,
  budget: AssetBudget,
  logTag: string,
): Promise<ArrayBuffer | null> {
  let response: Response;
  try {
    // 정적 자산이라 인증이 필요 없지만(preview 실측 무인증 200), 운영에서 게이트가 걸려 있을
    // 경우까지 한 번에 덮으려고 Bearer 를 싣는다 — origin 은 위에서 이미 커넥터로 제한했다.
    //
    // `fetchWithLog` 를 쓰지 않는다: 자산은 I/F 호출이 아니고, 영수증 1건마다 수십 건이
    // qp_interface_log 에 쌓이면 실제 I/F 이력이 묻힌다.
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      // origin 화이트리스트는 최초 1홉만 검사한다 — fileUrl 프록시와 같은 정책.
      redirect: "manual",
      signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    console.warn(`${logTag} 영수증 자산 fetch 실패 (${url}):`, error);
    return null;
  }

  if (!response.ok) {
    console.warn(`${logTag} 영수증 자산 비정상 응답 (${response.status}): ${url}`);
    return null;
  }

  let body: ArrayBuffer;
  try {
    body = await response.arrayBuffer();
  } catch (error: unknown) {
    console.warn(`${logTag} 영수증 자산 본문 읽기 실패 (${url}):`, error);
    return null;
  }

  if (body.byteLength > MAX_ASSET_BYTES || body.byteLength > budget.remaining) {
    console.warn(
      `${logTag} 영수증 자산 상한 초과 (${body.byteLength} bytes, 잔여 ${budget.remaining}): ${url}`,
    );
    return null;
  }
  budget.remaining -= body.byteLength;
  return body;
}

function toDataUri(body: ArrayBuffer, mime: string): string {
  return `data:${mime};base64,${Buffer.from(body).toString("base64")}`;
}

/** 경로 확장자로 이미지 MIME 판정. 쿼리·프래그먼트(`?20230301`, `#icons`)는 제외하고 본다. */
function imageMimeOf(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  for (const [ext, mime] of INLINE_IMAGE_EXTENSIONS) {
    if (pathname.endsWith(ext)) return mime;
  }
  return null;
}

/** CSS 안의 `url(...)` 중 이미지만 data: URI 로 치환한다. */
async function inlineCssUrls(
  css: string,
  cssUrl: string,
  token: string,
  budget: AssetBudget,
  logTag: string,
): Promise<string> {
  // `@font-face` 블록은 수집 대상에서 뺀다. font-awesome 은 **SVG 폰트**(`.svg`)로도 배포되어
  // 확장자만 보면 이미지로 걸리는데, 그것 하나가 444KB 다(전 폰트 합계 1.1MB). 영수증은 아이콘
  // 폰트를 쓰지 않으므로 인라인해도 쓰이지 않고 파일만 3배가 된다.
  const scanTarget = css.replace(/@font-face\s*\{[^}]*\}/gi, "");

  const refs = new Set<string>();
  for (const match of scanTarget.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = match[2].trim();
    if (!raw || raw.startsWith("data:")) continue;
    refs.add(raw);
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    [...refs].map(async (raw) => {
      const url = resolveAssetUrl(raw, cssUrl);
      if (!url) return;
      const mime = imageMimeOf(url);
      // 폰트·미디어는 건너뛴다. 영수증이 쓰지 않는데 font-awesome 만 1.1MB 다.
      if (!mime) return;
      const body = await fetchAsset(url, token, budget, logTag);
      if (!body) return;
      replacements.set(raw, toDataUri(body, mime));
    }),
  );

  if (replacements.size === 0) return css;
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _quote, raw: string) => {
    const dataUri = replacements.get(raw.trim());
    return dataUri ? `url(${dataUri})` : whole;
  });
}

/**
 * 영수증 HTML 을 자기완결 문서로 변환한다. 변환 불가·실패 시 `null`(원본 유지).
 *
 * 예상한 실패(디코드·fetch·상한)는 본체가 `null` 로 접지만, 그 밖의 예외까지 여기서 받아
 * `null` 로 만든다. 감싸지 않으면 `sekoBaseUrl()` 의 `ConfigError` 같은 예외가 라우트
 * 최상위 catch 로 올라가 **다운로드 자체가 500 으로 실패한다** — 인라인은 미화 단계이므로
 * 어떤 이유로든 다운로드를 막아서는 안 된다.
 *
 * @param body   AS-IS 가 내려준 HTML 원본 바이트
 * @param token  커넥터 Bearer (자산 fetch 에 동일 토큰 사용)
 */
export async function inlineSekoReceiptHtml(
  body: ArrayBuffer,
  token: string,
  logTag: string,
): Promise<string | null> {
  try {
    return await buildInlinedReceiptHtml(body, token, logTag);
  } catch (error: unknown) {
    console.warn(`${logTag} 영수증 인라인 중 예기치 못한 오류 — 원본 유지:`, error);
    return null;
  }
}

async function buildInlinedReceiptHtml(
  body: ArrayBuffer,
  token: string,
  logTag: string,
): Promise<string | null> {
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch (error: unknown) {
    console.warn(`${logTag} 영수증 HTML 디코드 실패 — 원본 유지:`, error);
    return null;
  }
  if (!/<html[\s>]/i.test(html)) {
    console.warn(`${logTag} 영수증 응답이 HTML 형태가 아님 — 원본 유지`);
    return null;
  }

  const budget: AssetBudget = { remaining: MAX_TOTAL_INLINE_BYTES };
  // 자산 URL 은 문서 자신의 위치 기준으로 푼다. fileUrl(`/api/download/receipt/{hash}`)이
  // 기준점이지만 참조가 모두 루트 절대경로(`/assets/...`)라 base 만 맞으면 동일하게 풀린다.
  const documentUrl = `${sekoBaseUrl()}/`;

  // ── 1) 스타일시트 → <style> 인라인 (CSS 내부 url() 까지 재귀 처리) ──
  const linkPattern = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;
  const linkTags = html.match(linkPattern) ?? [];
  for (const tag of linkTags) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const cssUrl = resolveAssetUrl(href, documentUrl);
    if (!cssUrl) {
      console.warn(`${logTag} 영수증 스타일시트가 커넥터 origin 밖 — 건너뜀: ${href}`);
      continue;
    }
    const cssBody = await fetchAsset(cssUrl, token, budget, logTag);
    if (!cssBody) continue;
    let css: string;
    try {
      // `fatal: true` — 없으면 UTF-8 이 아닌 스타일시트(Shift_JIS 등)가 예외 없이 U+FFFD 로
      // 치환되어 깨진 CSS 가 조용히 인라인된다. 위 HTML 디코드와 기준을 맞춘다.
      css = new TextDecoder("utf-8", { fatal: true }).decode(cssBody);
    } catch (error: unknown) {
      console.warn(`${logTag} 영수증 스타일시트 디코드 실패 — 건너뜀 (${cssUrl}):`, error);
      continue;
    }
    css = await inlineCssUrls(css, cssUrl, token, budget, logTag);
    // 치환값을 문자열로 넘기면 AS-IS CSS 안의 `$&` / `$'` 가 치환 특수패턴으로 해석되어
    // 문서가 통째로 중복 삽입된다 — 외부 통제 문자열이므로 함수 치환으로 차단한다.
    html = html.replace(tag, () => `<style>\n${css}\n</style>`);
  }

  // ── 2) 본문 <img> → data: URI ──
  // 스타일시트 인라인 **뒤**에 두면 styles.css 주석에 들어 있는 동일 경로 문자열이 먼저
  // 걸리므로, 반드시 `<img ...>` 태그 단위로 치환한다(문자열 단위 치환 금지).
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const imgUrl = resolveAssetUrl(src, documentUrl);
    if (!imgUrl) continue;
    const mime = imageMimeOf(imgUrl);
    if (!mime) continue;
    const imgBody = await fetchAsset(imgUrl, token, budget, logTag);
    if (!imgBody) continue;
    html = html.replace(tag, tag.replace(src, toDataUri(imgBody, mime)));
  }

  // ── 3) 렌더에 불필요한 요소 제거 ──
  // 스크립트는 영수증 표시에 쓰이지 않는다. 제거하면 외부 CDN(ajaxzip3.github.io) 호출이
  // 사라지고, AS-IS 가 만든 스크립트가 사용자 브라우저에서 실행될 여지도 함께 없어진다.
  html = html
    .replace(/\s*<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\s*<!--\[if[\s\S]*?<!\[endif\]-->/g, "")
    .replace(/\s*<link\b[^>]*rel=["']shortcut icon["'][^>]*>/gi, "");

  // ── 4) [印刷する] 버튼 블록 제거 — 다운로드 문서에는 영수증 본문만 남긴다 ──
  // 매칭 실패는 무해하다(버튼이 남을 뿐이므로 전체를 실패로 접지 않는다).
  html = html.replace(
    /\s*<div\b[^>]*class=["'][^"']*print-hidden[^"']*["'][^>]*>[\s\S]*?<\/div><!--\s*\/\.btns\s*-->/i,
    "",
  );

  // ── 5) 레이아웃 고정 오버라이드를 </head> 직전에 추가 ──
  // 인라인된 styles.css 보다 뒤에 와야 미디어쿼리 오버라이드를 이긴다.
  const overrideTag = `<style>${LAYOUT_OVERRIDE_CSS}</style>\n`;
  html = html.includes("</head>")
    ? html.replace("</head>", `${overrideTag}</head>`)
    : `${overrideTag}${html}`;

  return html;
}

/**
 * `fileName` 에 확장자가 없으면 `contentType` 기준으로 붙인다.
 *
 * AS-IS 실측: CERT1 은 `certificate.pdf` 인데 RECEIPT 는 `施工ID研修受講料領収書` 로 **확장자가
 * 없다.** 그대로 저장하면 확장자 없는 파일이 되어 더블클릭으로 열리지 않는다 — 인라인화와
 * 별개로 사용자가 겪는 증상의 절반이 여기서 나온다(Redmine #2481).
 */
export function ensureFileExtension(fileName: string, contentType: string): string {
  if (/\.[A-Za-z0-9]{2,5}$/.test(fileName)) return fileName;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  const ext =
    mime === "text/html"
      ? ".html"
      : mime === "application/pdf"
        ? ".pdf"
        : null;
  return ext ? `${fileName}${ext}` : fileName;
}
