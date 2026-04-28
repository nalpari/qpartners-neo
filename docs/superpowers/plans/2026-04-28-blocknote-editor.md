# BlockNote Editor 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 콘텐츠 등록·수정 화면(`/contents/create`, `/contents/[id]/edit`)의 본문 textarea를 BlockNote 기반 리치 에디터로 교체.

**Architecture:** Client-only BlockNote 컴포넌트를 `next/dynamic(ssr:false)`로 lazy-load 한다. 저장은 HTML(`Content.body MediumText`) 그대로 활용하므로 API/Zod/Prisma 변경이 없다. 레거시 plain-text는 읽기 시 단일 유틸(`prepareBodyForEditor`)로 정규화 후 `tryParseHTMLToBlocks`로 파싱하고, 상세 페이지는 기존 DOMPurify 파이프라인을 단일 유틸(`sanitizeContentHtml`)로 추출해 그대로 사용한다.

**Tech Stack:** Next.js 16.2 (App Router), React 19.2 + React Compiler, TypeScript strict, Tailwind v4, Prisma 7 (MariaDB), `@blocknote/{core,react,mantine}`, `@mantine/{core,hooks,utils}`, DOMPurify(기존).

**Spec:** [`docs/superpowers/specs/2026-04-28-blocknote-editor-design.md`](../specs/2026-04-28-blocknote-editor-design.md)

---

## 검증 정책 (전체 task 공통)

이 프로젝트는 자동화된 단위 테스트 인프라(Jest/Vitest)가 없다. 따라서 다음 정책을 모든 task에 일관 적용한다:

1. **유틸 함수**(`prepareBodyForEditor`, `sanitizeContentHtml`, `isHtmlEmpty`)는 임시 검증 스크립트(`scripts/verify-*.ts`)로 케이스별 expected vs actual을 출력해 눈으로 확인. 검증 완료 후 마지막 task에서 모두 삭제.
2. **컴포넌트 / 통합**은 `pnpm lint`, `pnpm tsc --noEmit`(또는 `pnpm build`), 그리고 `pnpm dev` 위에서 수동 브라우저 시나리오로 검증.
3. **각 task의 commit 직전**에 최소한 `pnpm lint`와 `pnpm tsc --noEmit`을 실행해 통과시킨다(빌드는 무거우니 통합 task에서만 실행).
4. 임시 스크립트 실행은 `pnpm dlx tsx scripts/verify-xxx.ts`. (`tsx`는 dev-only 일회성 도구로 dlx 사용 — package.json 의존성 추가 불요.)

**커밋 메시지 규칙(프로젝트 룰):** `<type>: <subject>` 형식. type은 feat/fix/refactor/style/docs/chore/test 영문, subject는 한국어, 50자 이내, 동사 원형으로 시작.

---

## Task 1: 의존성 설치 및 React 19 호환성 검증

**Files:**
- Modify: `package.json` (deps 추가)
- Modify: `pnpm-lock.yaml` (자동 갱신)

- [ ] **Step 1: Next.js 공식 문서 확인 (dynamic import / use client 경계)**

프로젝트 룰: "Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`."

```bash
ls node_modules/next/dist/docs/ 2>/dev/null | head -50
find node_modules/next/dist/docs/ -name "*.md" -path "*dynamic*" 2>/dev/null
find node_modules/next/dist/docs/ -name "*.md" -path "*client-component*" 2>/dev/null
```

해당 문서가 있으면 한 번 훑어보고, `dynamic(() => import(...), { ssr: false, loading: ... })`의 현재 권장 시그니처를 확인한다. (Next.js 16.2 기준이며, 이미 코드베이스에 동일 패턴이 있다면 그 패턴을 그대로 따른다.)

- [ ] **Step 2: BlockNote + Mantine 패키지 설치**

```bash
pnpm add @blocknote/core @blocknote/react @blocknote/mantine @mantine/core @mantine/hooks @mantine/utils
```

- [ ] **Step 3: peer dependency / React 19 경고 확인**

설치 출력에 React 19 관련 peer warning(예: `peer react@"^18..." but found react@"^19..."`)이 있는지 확인한다. 경고가 있으면 다음 중 하나로 대응:
- 사소한 peer만 경고하고 실제 동작에 문제 없으면 그대로 진행 (BlockNote 최신 버전은 React 19 공식 지원).
- 호환되지 않는 경고가 있으면 BlockNote 릴리스 노트 / 깃허브 issue를 확인 후 호환 버전을 다시 설치한다.

```bash
pnpm install 2>&1 | grep -iE "(peer|warn|deprecated)" || echo "no warnings"
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: PASS (의존성만 추가했으므로 기존 코드 영향 없음).

- [ ] **Step 5: Lint 체크**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: BlockNote와 Mantine 의존성 추가"
```

---

## Task 2: `prepareBodyForEditor` 유틸 작성

**Files:**
- Create: `src/lib/block-editor/prepare-body-for-editor.ts`
- Create (임시): `scripts/verify-prepare-body.ts`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p /Users/devgrr/dev/interplug/qpartners-neo/src/lib/block-editor
mkdir -p /Users/devgrr/dev/interplug/qpartners-neo/scripts
```

- [ ] **Step 2: 유틸 작성**

`src/lib/block-editor/prepare-body-for-editor.ts`:

```ts
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
```

- [ ] **Step 3: 검증 스크립트 작성**

`scripts/verify-prepare-body.ts`:

```ts
import { prepareBodyForEditor } from "../src/lib/block-editor/prepare-body-for-editor";

interface Case {
  name: string;
  input: string | null | undefined;
  expected: string;
}

const cases: Case[] = [
  { name: "null", input: null, expected: "" },
  { name: "undefined", input: undefined, expected: "" },
  { name: "empty string", input: "", expected: "" },
  { name: "single line plain text", input: "hello", expected: "<p>hello</p>" },
  {
    name: "two lines plain text",
    input: "line1\nline2",
    expected: "<p>line1</p><p>line2</p>",
  },
  {
    name: "blank line collapses",
    input: "line1\n\nline2",
    expected: "<p>line1</p><p>line2</p>",
  },
  {
    name: "CRLF newline",
    input: "line1\r\nline2",
    expected: "<p>line1</p><p>line2</p>",
  },
  {
    name: "already html passthrough",
    input: "<p>already html</p>",
    expected: "<p>already html</p>",
  },
  {
    name: "script tag preserved (sanitize is render-time responsibility)",
    input: "<script>x</script>",
    expected: "<script>x</script>",
  },
  {
    name: "plain text with html-like character escapes",
    input: "1 < 2",
    expected: "<p>1 &lt; 2</p>",
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const actual = prepareBodyForEditor(c.input);
  if (actual === c.expected) {
    pass++;
    console.log(`PASS  ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}\n      input:    ${JSON.stringify(c.input)}\n      expected: ${JSON.stringify(c.expected)}\n      actual:   ${JSON.stringify(actual)}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 4: 검증 스크립트 실행**

```bash
pnpm dlx tsx scripts/verify-prepare-body.ts
```

Expected: `10 passed, 0 failed` (또는 모두 PASS).

- [ ] **Step 5: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/block-editor/prepare-body-for-editor.ts
git commit -m "feat: prepareBodyForEditor 유틸 추가"
```

(검증 스크립트 `scripts/verify-prepare-body.ts`는 마지막 task에서 일괄 삭제하므로 이 시점에는 commit 하지 않는다.)

---

## Task 3: `sanitizeContentHtml` 유틸 작성

**Files:**
- Create: `src/lib/block-editor/sanitize-html.ts`
- Create (임시): `scripts/verify-sanitize-html.ts`

- [ ] **Step 1: 유틸 작성**

`src/lib/block-editor/sanitize-html.ts`:

```ts
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
  "target",
  "rel",
];

const SAFE_HREF_PATTERN = /^(https?:|mailto:|#)/i;
const SAFE_IMG_SRC_PATTERN = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i;

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
 * - 인라인 style 제거
 * - 위험한 href/src 스킴 제거
 * - target=_blank 링크에 rel=noopener noreferrer 부여
 */
export function sanitizeContentHtml(html: string | null | undefined): string {
  if (!html) return "";
  ensureHooksRegistered();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
  });
}
```

- [ ] **Step 2: 검증 스크립트 작성**

`scripts/verify-sanitize-html.ts`:

```ts
import { sanitizeContentHtml } from "../src/lib/block-editor/sanitize-html";

interface Case {
  name: string;
  input: string | null;
  /** actual.includes(expectedPart) 로 부분 매칭 (DOMPurify 출력의 미세한 표현 차이 흡수) */
  mustInclude?: string[];
  /** !actual.includes(forbidden) */
  mustNotInclude?: string[];
  /** 정확히 일치해야 하는 경우 */
  exact?: string;
}

const cases: Case[] = [
  { name: "null → empty", input: null, exact: "" },
  { name: "plain p", input: "<p>안녕</p>", mustInclude: ["<p>", "안녕", "</p>"] },
  {
    name: "script tag stripped",
    input: "<script>alert(1)</script><p>ok</p>",
    mustNotInclude: ["<script", "alert(1)"],
    mustInclude: ["ok"],
  },
  {
    name: "javascript href removed",
    input: '<a href="javascript:alert(1)">x</a>',
    mustNotInclude: ["javascript:"],
    mustInclude: ["x"],
  },
  {
    name: "https link kept",
    input: '<a href="https://example.com">x</a>',
    mustInclude: ['href="https://example.com"', "x"],
  },
  {
    name: "target=_blank gets rel=noopener noreferrer",
    input: '<a href="https://example.com" target="_blank">x</a>',
    mustInclude: ['target="_blank"', "noopener noreferrer"],
  },
  {
    name: "img https kept",
    input: '<img src="https://example.com/a.png" alt="a">',
    mustInclude: ['src="https://example.com/a.png"', 'alt="a"'],
  },
  {
    name: "img javascript src removed",
    input: '<img src="javascript:alert(1)" alt="x">',
    mustNotInclude: ["javascript:"],
  },
  {
    name: "img data:image/png base64 kept",
    input: '<img src="data:image/png;base64,iVBORw0KGgo=" alt="x">',
    mustInclude: ["data:image/png;base64,"],
  },
  {
    name: "inline style removed",
    input: '<p style="color:red">x</p>',
    mustNotInclude: ["style="],
    mustInclude: ["x"],
  },
  {
    name: "table structure preserved",
    input: "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>",
    mustInclude: ["<table>", "<thead>", "<tbody>", "<th>", "<td>"],
  },
  {
    name: "data-* allowed",
    input: '<p data-block-id="abc">x</p>',
    mustInclude: ["data-block-id"],
  },
  {
    name: "class allowed",
    input: '<p class="bn-paragraph">x</p>',
    mustInclude: ['class="bn-paragraph"'],
  },
  {
    name: "iframe stripped",
    input: '<iframe src="https://example.com"></iframe><p>x</p>',
    mustNotInclude: ["<iframe"],
    mustInclude: ["x"],
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const actual = sanitizeContentHtml(c.input);
  let ok = true;
  const reasons: string[] = [];

  if (c.exact !== undefined && actual !== c.exact) {
    ok = false;
    reasons.push(`exact mismatch: expected ${JSON.stringify(c.exact)}, actual ${JSON.stringify(actual)}`);
  }
  for (const part of c.mustInclude ?? []) {
    if (!actual.includes(part)) {
      ok = false;
      reasons.push(`missing: ${JSON.stringify(part)}`);
    }
  }
  for (const part of c.mustNotInclude ?? []) {
    if (actual.includes(part)) {
      ok = false;
      reasons.push(`should not include: ${JSON.stringify(part)}`);
    }
  }

  if (ok) {
    pass++;
    console.log(`PASS  ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}\n      actual: ${JSON.stringify(actual)}\n      ${reasons.join("\n      ")}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 3: 검증 스크립트 실행**

```bash
pnpm dlx tsx scripts/verify-sanitize-html.ts
```

Expected: 모든 케이스 PASS.

- [ ] **Step 4: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/block-editor/sanitize-html.ts
git commit -m "feat: sanitizeContentHtml 본문 sanitize 유틸 추가"
```

---

## Task 4: `isHtmlEmpty` 유틸 작성

빈 본문 검증을 위해 BlockNote 출력 HTML이 실제로 텍스트가 비어 있는지 판별하는 단순 유틸. (BlockNote의 빈 문서 출력이 `<p class="bn-...."></p>` 형태라 `.trim()`만으로는 빈 본문 판별이 안 됨.)

**Files:**
- Create: `src/lib/block-editor/is-html-empty.ts`
- Create (임시): `scripts/verify-is-html-empty.ts`

- [ ] **Step 1: 유틸 작성**

`src/lib/block-editor/is-html-empty.ts`:

```ts
/**
 * HTML 문자열이 사용자에게 보이는 텍스트(이미지·테이블 셀 포함) 없이 비어 있는지 검사한다.
 * - 모든 태그를 제거하고 &nbsp; / 공백 문자를 정리한 결과가 빈 문자열이면 빈 본문으로 본다.
 * - 단, <img> 태그가 하나라도 있으면 "내용 있음"으로 간주.
 * - <td>/<th>는 표 셀이라 셀 내부에 텍스트가 없으면 빈 것으로 본다 (헤딩만 있는 빈 표는 빈 본문).
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
```

- [ ] **Step 2: 검증 스크립트 작성**

`scripts/verify-is-html-empty.ts`:

```ts
import { isHtmlEmpty } from "../src/lib/block-editor/is-html-empty";

interface Case {
  name: string;
  input: string | null | undefined;
  expected: boolean;
}

const cases: Case[] = [
  { name: "null", input: null, expected: true },
  { name: "undefined", input: undefined, expected: true },
  { name: "empty string", input: "", expected: true },
  { name: "blank only", input: "   \n  ", expected: true },
  { name: "empty p", input: "<p></p>", expected: true },
  { name: "empty p with class", input: '<p class="bn-paragraph"></p>', expected: true },
  { name: "p with nbsp only", input: "<p>&nbsp;</p>", expected: true },
  { name: "p with zero-width space", input: "<p>​</p>", expected: true },
  { name: "p with text", input: "<p>hello</p>", expected: false },
  { name: "heading with text", input: "<h1>title</h1>", expected: false },
  { name: "img only", input: '<p><img src="https://x.png"></p>', expected: false },
  { name: "list with item", input: "<ul><li>x</li></ul>", expected: false },
  { name: "empty list", input: "<ul><li></li></ul>", expected: true },
  { name: "table with cell text", input: "<table><tbody><tr><td>x</td></tr></tbody></table>", expected: false },
  { name: "table empty cells", input: "<table><tbody><tr><td></td></tr></tbody></table>", expected: true },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const actual = isHtmlEmpty(c.input);
  if (actual === c.expected) {
    pass++;
    console.log(`PASS  ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}\n      input:    ${JSON.stringify(c.input)}\n      expected: ${c.expected}\n      actual:   ${actual}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 3: 검증 스크립트 실행**

```bash
pnpm dlx tsx scripts/verify-is-html-empty.ts
```

Expected: 모든 케이스 PASS.

- [ ] **Step 4: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/block-editor/is-html-empty.ts
git commit -m "feat: isHtmlEmpty 빈 본문 판별 유틸 추가"
```

---

## Task 5: 허용 블록 스키마 정의

**Files:**
- Create: `src/lib/block-editor/allowed-blocks.ts`

- [ ] **Step 1: 스키마 작성**

`src/lib/block-editor/allowed-blocks.ts`:

```ts
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";

/**
 * 콘텐츠 본문 에디터에서 허용할 BlockNote 블록 목록.
 * - heading (levels 1~3) / paragraph
 * - bulletListItem / numberedListItem / checkListItem
 * - quote / codeBlock / table / image (URL only)
 *
 * 비활성: video / audio / file / pageBreak (스코프 제외)
 *
 * BlockNote는 schema에 등록된 블록만 슬래시 메뉴·사이드 메뉴에 노출하므로
 * 별도 메뉴 필터 코드는 불필요하다.
 */
export const allowedBlocksSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    table: defaultBlockSpecs.table,
    image: defaultBlockSpecs.image,
  },
});
```

**메모:** `defaultBlockSpecs.heading`은 H1–H6 전부를 가능케 한다. 콘텐츠 정책상 H1–H3만 허용하고 싶다면 후속 task에서 `heading` 블록의 `propSchema.level.values`를 `[1, 2, 3]`로 좁힐 수 있으나(헤딩 props 커스터마이즈), 이번 도입 범위에서는 BlockNote 기본 동작을 그대로 둔다 — 슬래시 메뉴는 H1–H3만 표시하므로 실사용 영향이 작다.

- [ ] **Step 2: 타입 체크 (BlockNote 패키지 export 확인)**

```bash
pnpm tsc --noEmit
```

Expected: PASS. 만약 `defaultBlockSpecs` import가 `@blocknote/core`에서 안 되면(릴리스에 따라 export가 약간 다를 수 있음) `node_modules/@blocknote/core/dist/index.d.ts`를 확인해 정확한 이름을 사용한다. 일반적으로 `defaultBlockSpecs`로 export되어 있으나, 만약 `defaultBlocks`나 `defaultBlockSchema`로 되어 있다면 그 이름으로 교체한다.

- [ ] **Step 3: Lint 체크**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/block-editor/allowed-blocks.ts
git commit -m "feat: BlockNote 허용 블록 스키마 정의"
```

---

## Task 6: BlockEditor 타입과 Skeleton 컴포넌트

**Files:**
- Create: `src/components/common/block-editor/block-editor.types.ts`
- Create: `src/components/common/block-editor/block-editor-skeleton.tsx`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p /Users/devgrr/dev/interplug/qpartners-neo/src/components/common/block-editor
```

- [ ] **Step 2: 타입 파일 작성**

`src/components/common/block-editor/block-editor.types.ts`:

```ts
export interface BlockEditorProps {
  /** 초기 HTML 값. 마운트 시점에만 사용되며 이후는 BlockNote 내부 상태가 source of truth. */
  value: string;
  /** 본문이 변경될 때마다 호출. 인자는 BlockNote가 출력한 풀 HTML 문자열. */
  onChange: (html: string) => void;
  /** 비어 있을 때 표시할 안내 문구 (BlockNote는 첫 paragraph에 표시). */
  placeholder?: string;
  /** false면 readonly. */
  editable?: boolean;
  /** 외곽 컨테이너에 부여할 aria-label. */
  ariaLabel?: string;
}
```

- [ ] **Step 3: Skeleton 컴포넌트 작성**

`src/components/common/block-editor/block-editor-skeleton.tsx`:

```tsx
"use client";

/**
 * BlockEditor 동적 import 로딩 중 표시되는 placeholder.
 * 본문 영역과 같은 최소 높이를 잡아 layout shift를 최소화한다.
 */
export function BlockEditorSkeleton() {
  return (
    <div
      role="status"
      aria-label="エディタを読み込み中"
      className="w-full min-h-[300px] px-4 py-4 border border-[#EBEBEB] rounded-[6px] bg-white"
    >
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-[#EEE] rounded w-1/3" />
        <div className="h-4 bg-[#EEE] rounded w-2/3" />
        <div className="h-4 bg-[#EEE] rounded w-1/2" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/block-editor/block-editor.types.ts src/components/common/block-editor/block-editor-skeleton.tsx
git commit -m "feat: BlockEditor 타입 및 Skeleton 컴포넌트 추가"
```

---

## Task 7: BlockEditor 본체 컴포넌트

BlockNote 인스턴스 생성 + 초기 HTML 파싱 + onChange 콜백.

**Files:**
- Create: `src/components/common/block-editor/block-editor.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/common/block-editor/block-editor.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import * as locales from "@blocknote/core/locales";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import { allowedBlocksSchema } from "@/lib/block-editor/allowed-blocks";
import { prepareBodyForEditor } from "@/lib/block-editor/prepare-body-for-editor";
import type { BlockEditorProps } from "./block-editor.types";

export function BlockEditor({
  value,
  onChange,
  placeholder,
  editable = true,
  ariaLabel,
}: BlockEditorProps) {
  const editor = useCreateBlockNote({
    schema: allowedBlocksSchema,
    dictionary: locales.ja,
  });

  // 마운트 시점의 value만 캡처 — 이후는 BlockNote 내부 상태가 진실의 원천.
  // value가 바뀌어 폼 reset이 필요한 경우는 부모에서 컴포넌트 트리를 리마운트한다.
  const initialValueRef = useRef(value);

  useEffect(() => {
    let cancelled = false;
    const html = prepareBodyForEditor(initialValueRef.current);
    if (!html) return;

    void (async () => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
    })();

    return () => {
      cancelled = true;
    };
  }, [editor]);

  useEditorChange(async (e) => {
    const html = await e.blocksToFullHTML(e.document);
    onChange(html);
  }, editor);

  return (
    <div
      aria-label={ariaLabel}
      className="w-full border border-[#EBEBEB] rounded-[6px] bg-white transition-colors duration-150 hover:border-[#D1D1D1] focus-within:border-[#101010]"
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        data-placeholder={placeholder}
      />
    </div>
  );
}

export default BlockEditor;
```

**메모:**
- `useEffect` 의존성에 `value` 대신 `initialValueRef.current`를 사용하기 위해 `useRef`로 마운트 시점 값을 캡처. ESLint `react-hooks/exhaustive-deps`는 `editor`만 deps로 두는 것을 허용한다(ref는 stable).
- React Compiler 룰 `react-hooks/set-state-in-effect`: 이 useEffect는 React state를 setState 하지 않고 BlockNote 내부 메서드(`replaceBlocks`)만 호출하므로 위반하지 않는다.
- `dictionary: locales.ja`는 모듈 import이므로 reference가 안정적 → editor 재생성 없음.
- `data-placeholder` 속성은 BlockNote가 빈 paragraph에 자동으로 표시하지 않으면 정적 위치 표시기 정도로만 사용한다. 실 placeholder 동작은 BlockNote 디폴트(영문 "Type to start writing..."이 ja 사전으로 자동 일본어화).

- [ ] **Step 2: locales.ja 존재 확인**

```bash
grep -lE "(^|\s)ja\s*[:=]|\"ja\"" node_modules/@blocknote/core/dist/locales/index.d.ts 2>/dev/null || \
  ls node_modules/@blocknote/core/dist/locales/
```

Expected: `ja`가 export 되어 있음. 만약 다른 이름이면(예: `ja-JP`) 정확한 키로 교체한다.

- [ ] **Step 3: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS. 흔한 이슈:
- `useEditorChange` import 경로가 다를 수 있음 → `@blocknote/react`에서 export 확인.
- `editor.tryParseHTMLToBlocks` 시그니처는 비동기로 가정 (문서 확인됨).

- [ ] **Step 4: Commit**

```bash
git add src/components/common/block-editor/block-editor.tsx
git commit -m "feat: BlockEditor 본체 컴포넌트 추가"
```

---

## Task 8: BlockEditorLoader (next/dynamic wrapper)

**Files:**
- Create: `src/components/common/block-editor/block-editor-loader.tsx`
- Create: `src/components/common/block-editor/index.ts`

- [ ] **Step 1: Loader 작성**

`src/components/common/block-editor/block-editor-loader.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { BlockEditorProps } from "./block-editor.types";
import { BlockEditorSkeleton } from "./block-editor-skeleton";

const DynamicBlockEditor = dynamic<BlockEditorProps>(
  () => import("./block-editor").then((m) => m.BlockEditor),
  {
    ssr: false,
    loading: () => <BlockEditorSkeleton />,
  },
);

export function BlockEditorLoader(props: BlockEditorProps) {
  return <DynamicBlockEditor {...props} />;
}
```

- [ ] **Step 2: barrel export 작성**

`src/components/common/block-editor/index.ts`:

```ts
export { BlockEditorLoader } from "./block-editor-loader";
export { BlockEditorSkeleton } from "./block-editor-skeleton";
export type { BlockEditorProps } from "./block-editor.types";
```

- [ ] **Step 3: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/block-editor/block-editor-loader.tsx src/components/common/block-editor/index.ts
git commit -m "feat: BlockEditorLoader 동적 import 래퍼 추가"
```

---

## Task 9: 상세 페이지 sanitize 통합

기존 `contents-detail-body.tsx`가 `DOMPurify.sanitize`를 직접 호출하던 것을 단일 유틸 `sanitizeContentHtml`로 교체.

**Files:**
- Modify: `src/components/contents/detail/contents-detail-body.tsx`

- [ ] **Step 1: 현재 sanitize 호출 부분 확인**

```bash
sed -n '70,80p' /Users/devgrr/dev/interplug/qpartners-neo/src/components/contents/detail/contents-detail-body.tsx
```

확인 대상: `DOMPurify.sanitize(body.replace(/\n/g, "<br>"))` 패턴.

- [ ] **Step 2: import 변경**

`src/components/contents/detail/contents-detail-body.tsx` 상단의 `import DOMPurify from "dompurify";`를 다음으로 교체:

```ts
import { sanitizeContentHtml } from "@/lib/block-editor/sanitize-html";
```

- [ ] **Step 3: 본문 렌더 부분 변경**

기존:

```tsx
{body && (
  <div
    className="font-['Noto_Sans_JP'] text-[14px] leading-[1.7] text-[#505050] prose prose-sm max-w-none"
    dangerouslySetInnerHTML={{
      __html: DOMPurify.sanitize(body.replace(/\n/g, "<br>")),
    }}
  />
)}
```

→ 다음으로 교체:

```tsx
{body && (
  <div
    className="font-['Noto_Sans_JP'] text-[14px] leading-[1.7] text-[#505050] prose prose-sm max-w-none"
    dangerouslySetInnerHTML={{
      __html: sanitizeContentHtml(body.replace(/\n/g, "<br>")),
    }}
  />
)}
```

`\n → <br>` 전처리는 레거시 plain-text 호환을 위해 그대로 유지(렌더 컴포넌트 책임). sanitize 유틸은 입력 HTML 검사·필터에만 집중.

- [ ] **Step 4: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS. (`dompurify` import 제거로 unused import 경고 없음 확인.)

- [ ] **Step 5: 수동 XSS 시나리오 검증**

```bash
pnpm dev
```

브라우저에서:
1. 기존 콘텐츠 1건 상세 페이지 진입(`/contents/<id>`) → 본문이 정상 렌더되는지 확인.
2. (선택) 개발자 도구로 임의 콘텐츠의 body를 `<script>alert(1)</script><p>x</p>` 같은 값으로 바꿔 응답을 가로채 보거나, `prisma studio`로 DB body를 직접 수정 후 페이지 진입 → 스크립트 미실행, `x`만 표시되는지 확인.

- [ ] **Step 6: Commit**

```bash
git add src/components/contents/detail/contents-detail-body.tsx
git commit -m "refactor: 상세 본문 sanitize 단일 유틸로 통합"
```

---

## Task 10: 폼 에디터 컴포넌트 — BlockEditorLoader 적용

**Files:**
- Modify: `src/components/contents/create/contents-form-editor.tsx`

- [ ] **Step 1: 변경 후 전체 파일 작성**

`src/components/contents/create/contents-form-editor.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import { InputBox } from "@/components/common";
import { BlockEditorLoader } from "@/components/common/block-editor";

interface ContentsFormEditorProps {
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
}

export function ContentsFormEditor({
  title,
  onTitleChange,
  content,
  onContentChange,
}: ContentsFormEditorProps) {
  return (
    <>
      {/* 제목 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          タイトル
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <InputBox
          value={title}
          onChange={onTitleChange}
          placeholder="タイトルを入力してください"
        />
      </section>

      {/* 내용 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          内容
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <BlockEditorLoader
          value={content}
          onChange={onContentChange}
          ariaLabel="内容を入力"
          placeholder="内容を入力してください"
        />
      </section>
    </>
  );
}
```

- [ ] **Step 2: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit (수동 검증 전 단계 commit)**

```bash
git add src/components/contents/create/contents-form-editor.tsx
git commit -m "feat: 콘텐츠 본문 입력을 BlockEditor로 교체"
```

---

## Task 11: 빈 본문 검증 교체

`contents-form.tsx`의 `handleSave`에서 `if (!content.trim())` 검증이 BlockNote 빈 문서(`<p></p>`)를 통과시키는 함정 해결.

**Files:**
- Modify: `src/components/contents/create/contents-form.tsx`

- [ ] **Step 1: import 추가**

`src/components/contents/create/contents-form.tsx` 상단의 import 블록에 다음 한 줄을 추가:

```ts
import { isHtmlEmpty } from "@/lib/block-editor/is-html-empty";
```

- [ ] **Step 2: 검증 라인 교체**

기존(파일 안에서 검색):

```ts
if (!content.trim()) {
  openAlert({ type: "alert", message: "内容は必須入力項目です。" });
  return;
}
```

→ 다음으로 교체:

```ts
if (isHtmlEmpty(content)) {
  openAlert({ type: "alert", message: "内容は必須入力項目です。" });
  return;
}
```

- [ ] **Step 3: Lint / 타입 체크**

```bash
pnpm lint && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/contents/create/contents-form.tsx
git commit -m "fix: 빈 본문 검증을 isHtmlEmpty로 교체"
```

---

## Task 12: 통합 검증 (lint / type / build / 수동 시나리오)

**Files:** (변경 없음)

- [ ] **Step 1: Lint**

```bash
pnpm lint
```

Expected: 오류 0건. 경고가 있으면 가능하면 해결한다(프로젝트 룰).

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: 프로덕션 빌드**

```bash
pnpm build
```

Expected: SUCCESS. 빌드 로그에서 `/contents/create` 와 `/contents/[id]/edit` 라우트의 First Load JS 또는 청크 크기 항목을 확인. BlockNote 청크가 별도로 분리되어 다른 페이지(`/`, `/admin`, `/inquiry`)의 First Load JS에는 포함되지 않아야 한다.

- [ ] **Step 4: 개발 서버 기동**

```bash
pnpm dev
```

- [ ] **Step 5: 수동 시나리오 — 신규 작성 (스펙 §7.2 #1)**

`/contents/create` 진입:
1. 제목 입력 → 본문 클릭 → 슬래시(`/`) 입력 → 슬래시 메뉴가 일본어로 표시되는지 확인.
2. 헤딩(`Heading 1`/`見出し1`) 추가 → 텍스트 입력.
3. 새 줄에서 슬래시 → 불릿 리스트 → 두 항목 입력.
4. 새 줄에서 슬래시 → 표(`Table`) → 셀에 텍스트 입력.
5. 새 줄에서 슬래시 → 코드 블록 → 코드 입력.
6. 새 줄에서 슬래시 → 인용 → 텍스트 입력.
7. 일본어 IME 입력(예: ひらがな・かんじ 변환 확정) → 입력이 깨지지 않는지 확인.
8. 카테고리·게시대상·승인자 입력 → 「保存」 클릭 → 상세 페이지로 이동되는지 확인.
9. 상세 페이지에서 모든 블록 구조가 동일하게 렌더되는지 확인 (헤딩, 리스트, 표, 코드, 인용, 단락).

- [ ] **Step 6: 수동 시나리오 — 허용 외 블록 차단 (스펙 §7.2 #2)**

`/contents/create` 슬래시 메뉴를 다시 열어 다음 항목이 **표시되지 않음** 확인:
- Video / 動画
- Audio / 音声
- File / ファイル
- Page Break / ページ区切り

(BlockNote는 schema에 등록된 블록만 슬래시 메뉴에 노출하므로, allowed-blocks의 효과 검증.)

- [ ] **Step 7: 수동 시나리오 — 이미지 URL (스펙 §7.2 #3)**

슬래시 메뉴 → Image / 画像 선택 → 모달에서 **Upload 탭이 표시되지 않고**(또는 비활성), URL 탭만 사용 가능한지 확인. https URL 입력 → 본문에 이미지 표시 → 저장 → 상세 페이지에서 동일 이미지 표시.

- [ ] **Step 8: 수동 시나리오 — 레거시 데이터 호환 (스펙 §7.2 #4)**

DB에 plain-text 본문을 가진 기존 콘텐츠 1건을 선택해 `/contents/<id>/edit` 진입:
- 줄바꿈이 단락별로 분리되어 표시되는지 확인.
- 그대로 「保存」 → 상세 페이지에서 단락 구조 유지되는지 확인.
- (이 시점부터 해당 콘텐츠는 HTML로 저장됨 — DB에서 body 컬럼 확인하면 `<p>` 태그 포함.)

```bash
# DB 확인용 (선택)
docker compose exec db mariadb -uroot -p qpartners -e "SELECT id, LEFT(body, 200) FROM qp_contents ORDER BY updated_at DESC LIMIT 5;"
```

- [ ] **Step 9: 수동 시나리오 — 빈 본문 검증 (스펙 §7.2 #5)**

`/contents/create` 진입 → 본문을 비운 채 「保存」 클릭 → `内容は必須入力項目です。` 알림 표시 확인.

추가로 BlockNote에 빈 paragraph만 둔 상태(스페이스로 한번 입력 후 지우기 등)에서도 동일 알림이 뜨는지 확인.

- [ ] **Step 10: 수동 시나리오 — 번들 분리 (스펙 §7.2 #7)**

브라우저 DevTools → Network 탭(JS 필터) 활성화:
1. 새 시크릿 창에서 `/`(또는 `/admin`) 첫 진입 → BlockNote/Mantine 청크가 **로드되지 않음** 확인 (청크 파일명에 `block-editor`, `mantine`, `blocknote` 키워드 검색).
2. `/contents/create` 진입 → 해당 청크가 동적으로 로드되는지 확인.

- [ ] **Step 11: 수동 시나리오 — 콘솔 경고 0건 (스펙 §7.2 #8)**

`/contents/create` 와 `/contents/<id>/edit` 진입 시 브라우저 콘솔에 다음 항목이 없어야 함:
- React Compiler 룰 위반 (`set-state-in-effect`, `set-state-in-render` 등)
- React 19 hydration mismatch
- BlockNote 자체 경고 (peer mismatch 외)

- [ ] **Step 12: 수동 시나리오 — XSS (스펙 §7.2 #6)**

`prisma studio` 또는 직접 SQL로 임의 콘텐츠 body를 다음으로 갱신:

```html
<p>before</p><script>window.__xssTriggered=true</script><a href="javascript:alert(1)">link</a><p>after</p>
```

상세 페이지(`/contents/<id>`) 진입:
- 알럿 미발생, `window.__xssTriggered`가 `undefined`인지 콘솔에서 확인.
- `link` 텍스트는 표시되지만 href가 비어있거나 제거되어 클릭해도 아무 동작 없음.

검증 후 콘텐츠 body는 원상복구한다.

- [ ] **Step 13: Commit (시나리오 결과는 commit 대상 없음 — 단계 마킹용)**

(이 task에는 코드 변경이 없으므로 commit 없음.)

---

## Task 13: 임시 검증 스크립트 정리

**Files:**
- Delete: `scripts/verify-prepare-body.ts`
- Delete: `scripts/verify-sanitize-html.ts`
- Delete: `scripts/verify-is-html-empty.ts`

- [ ] **Step 1: 검증 스크립트 삭제**

```bash
rm /Users/devgrr/dev/interplug/qpartners-neo/scripts/verify-prepare-body.ts
rm /Users/devgrr/dev/interplug/qpartners-neo/scripts/verify-sanitize-html.ts
rm /Users/devgrr/dev/interplug/qpartners-neo/scripts/verify-is-html-empty.ts
```

`scripts/` 디렉터리에 다른 파일이 없으면 같이 삭제한다.

```bash
rmdir /Users/devgrr/dev/interplug/qpartners-neo/scripts 2>/dev/null || true
```

- [ ] **Step 2: 상태 확인**

```bash
git status
```

Expected: deleted: scripts/verify-*.ts (단, 이 파일들은 한 번도 commit된 적 없으므로 working tree에서 단순히 사라짐. `git status`에는 변동 없음). 만약 실수로 commit 되어 있다면 별도 commit으로 삭제.

- [ ] **Step 3: Commit (필요 시)**

스크립트가 git tracked 상태였다면:

```bash
git add -A scripts
git commit -m "chore: BlockNote 도입 검증 스크립트 정리"
```

아니면 이 step은 skip.

---

## Task 14: 문서 업데이트

**Files:**
- Modify: `CLAUDE.md` 또는 `README.md` (상황에 맞게)

- [ ] **Step 1: README.md 또는 CLAUDE.md에 변경 사항 메모**

`README.md`에 "Architecture" 또는 "주요 컴포넌트" 섹션이 있으면 BlockNote 에디터 항목을 추가한다. 항목 예시(`README.md`의 적절한 섹션에 한 줄 추가):

```md
- **본문 에디터**: 콘텐츠 등록/수정 화면은 BlockNote(`@blocknote/mantine`) 기반. 컴포넌트는 `src/components/common/block-editor/`, 본문 정규화·sanitize 유틸은 `src/lib/block-editor/`.
```

`CLAUDE.md`/`AGENTS.md`에는 현재 BlockNote 관련 정책이 없으므로, **콘텐츠 본문을 새 화면에서 다룰 때 같은 컴포넌트를 사용한다**는 한 줄 가이드만 추가(`Architecture` 섹션 끝에):

```md
- **Rich Text 에디터**: 콘텐츠 본문 입력은 `@/components/common/block-editor`의 `BlockEditorLoader` 사용. 저장은 HTML, 렌더는 `@/lib/block-editor/sanitize-html`의 `sanitizeContentHtml` 통과 필수.
```

(README.md / CLAUDE.md 어느 쪽에 들어갈지는 기존 문서 구성을 보고 판단. 한 곳에만 추가.)

- [ ] **Step 2: Lint (markdown은 lint 대상 아님 — skip 가능)**

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: BlockNote 에디터 도입 메모 추가"
```

(실제 변경된 파일만 add.)

---

## Self-Review

(plan 작성자가 plan 작성 직후 수행한 점검 결과)

**1. Spec 커버리지** — `docs/superpowers/specs/2026-04-28-blocknote-editor-design.md`의 각 섹션과 task 매핑:

| Spec 섹션 | 매핑 task |
| --- | --- |
| §3.1 의존성 설치 | Task 1 |
| §3.2.7 React 19 호환성 검증 | Task 1 Step 3 |
| §4.1 `prepare-body-for-editor.ts` | Task 2 |
| §4.1 `sanitize-html.ts` | Task 3 |
| (스펙엔 별도 섹션 없음) `isHtmlEmpty` | Task 4 — §5.4의 빈 본문 검증을 위해 plan에서 추가 |
| §4.1 `allowed-blocks.ts` | Task 5 |
| §4.1 `block-editor.types.ts`, `block-editor-skeleton.tsx` | Task 6 |
| §4.1 `block-editor.tsx` | Task 7 |
| §4.1 `block-editor-loader.tsx`, `index.ts` | Task 8 |
| §4.1 `contents-detail-body.tsx` 변경 | Task 9 |
| §4.1 `contents-form-editor.tsx` 변경 | Task 10 |
| §5.4 빈 본문 검증 | Task 11 |
| §6 호환성·에러 처리 | Task 7(컴포넌트 내), Task 12(통합 검증) |
| §7 테스트 전략 | Task 2/3/4(자동 검증), Task 12(수동 시나리오) |
| §8.8 문서 업데이트 | Task 14 |

스펙 모든 요구가 task에 매핑됨.

**2. Placeholder 스캔** — "TBD", "TODO", "implement later", "fill in", "Add appropriate", "handle edge cases" 검색 0건.

**3. Type / 시그니처 일관성** —
- `prepareBodyForEditor(body: string | null | undefined): string` (Task 2) ↔ `block-editor.tsx`에서 사용 (Task 7) — 일치.
- `sanitizeContentHtml(html: string | null | undefined): string` (Task 3) ↔ `contents-detail-body.tsx`에서 사용 (Task 9) — 일치.
- `isHtmlEmpty(html: string | null | undefined): boolean` (Task 4) ↔ `contents-form.tsx`에서 사용 (Task 11) — 일치.
- `BlockEditorProps` (Task 6) ↔ `block-editor.tsx` 구현 (Task 7) ↔ `block-editor-loader.tsx` (Task 8) — 일치.
- `allowedBlocksSchema` (Task 5) ↔ `block-editor.tsx` import (Task 7) — 일치.

**4. 모호성·논리 점검** —
- Task 5에서 `defaultBlockSpecs` 이름이 BlockNote 패키지 버전에 따라 다를 수 있음 — Step 2에 명시적 폴백 안내 포함됨.
- Task 7에서 `useEditorChange`/`useCreateBlockNote` import 경로 이슈 가능 — Step 3에 폴백 안내 포함.
- Task 12 Step 3 빌드 후 청크 검증은 수동 — 정성적이지만 명시적 키워드(blocknote/mantine)를 두어 검증 가능.
- Task 12 Step 12 XSS 검증에서 DB 직접 갱신 후 원복 — 운영 데이터 손상 위험 낮음(개발 환경 전제).

이슈 없음. plan 그대로 진행 가능.
