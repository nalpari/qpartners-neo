# Tiptap Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/contents` 본문 에디터를 BlockNote 0.49에서 Tiptap headless로 교체. 외부 인터페이스(`RichEditorProps`)는 보존, lazy 마이그레이션으로 DB 변경 없음.

**Architecture:** 외과적 교체 — `block-editor/` 디렉토리 내부 구현만 Tiptap으로 갈아끼우고, 같은 작업의 일부로 디렉토리·심볼명을 `rich-editor`로 리네임한다. 단계별로 PR-1(rich-editor 리네임 / 동작 무변경) → PR-2(BlockNote → Tiptap 본체 교체)로 분할. 호환성 위험 두 곳: 테이블 colwidth는 `prepareBodyForRender`에서 `colgroup>col[style:width]`로 정규화하고, 체크리스트는 비활성하되 sanitize 화이트리스트로 fallback 표시를 보장한다.

**Tech Stack:** Next.js 16.2 / App Router, React 19, TypeScript strict, Tailwind v4, `@tiptap/react ^2`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-{image,table,table-row,table-header,table-cell,placeholder}`, `@tiptap/suggestion`, `tippy.js`, `isomorphic-dompurify`(기존).

**스펙:** [docs/superpowers/specs/2026-05-04-tiptap-migration-design.md](../specs/2026-05-04-tiptap-migration-design.md)

**참고:**
- 단위 테스트 인프라는 본 마이그레이션 범위 외. 검증은 정적 검증(`pnpm lint` / `pnpm build`)과 수동 회귀 체크리스트(태스크 4·태스크 16)로 게이트한다.
- 본 마이그레이션은 단일 사용처(`src/components/contents/create/contents-form-editor.tsx`)에 한정. 외부 호출 API(`RichEditorProps`)는 한 글자도 변경하지 않는다.

---

## File Structure

### PR-1 — rename only (동작 무변경)

| 변경 종류 | 경로 |
|---|---|
| rename dir | `src/components/common/block-editor/` → `src/components/common/rich-editor/` |
| rename dir | `src/lib/block-editor/` → `src/lib/rich-editor/` |
| rename file | `block-editor.tsx` → `rich-editor.tsx` |
| rename file | `block-editor-loader.tsx` → `rich-editor-loader.tsx` |
| rename file | `block-editor-skeleton.tsx` → `rich-editor-skeleton.tsx` |
| rename file | `block-editor.types.ts` → `rich-editor.types.ts` |
| rename symbol | `BlockEditor` → `RichEditor` (그리고 Loader/Skeleton/Props도 동일 prefix) |
| rename log prefix | `[BlockEditor]` → `[RichEditor]` (소스 내 모든 로그 메시지) |
| update imports | 외부 4곳 — `contents-form-editor.tsx`, `contents-form.tsx`, `contents-detail-body.tsx`, `inline-image-cleanup.ts` |

### PR-2 — Tiptap 본체 교체

**새로 생성하는 파일**

| 경로 | 책임 |
|---|---|
| `src/components/common/rich-editor/editor-i18n.ts` | 일본어 라벨/메시지 사전 |
| `src/components/common/rich-editor/editor-extensions.ts` | Tiptap extension 화이트리스트(StarterKit + Image + Table + Placeholder + InlineImagePaste + SlashCommand) |
| `src/components/common/rich-editor/editor-toolbar.tsx` | 상단 고정 툴바(G1~G6) |
| `src/components/common/rich-editor/editor-slash-menu.tsx` | SlashCommand extension + MenuList React 컴포넌트(suggestion + tippy.js + ReactRenderer) |
| `src/components/common/rich-editor/inline-image-paste.ts` | paste/drop 자동 업로드 ProseMirror plugin |

**삭제하는 파일**

| 경로 | 이유 |
|---|---|
| `src/lib/rich-editor/allowed-blocks.ts` | `editor-extensions.ts`로 대체 |

**기존 파일 수정**

| 경로 | 수정 내용 |
|---|---|
| `package.json` | `@blocknote/*` 제거, `@tiptap/*` + `tippy.js` 추가 |
| `src/components/common/rich-editor/rich-editor.tsx` | Tiptap 구현으로 본체 재작성 |
| `src/lib/rich-editor/prepare-body-for-render.ts` | `td[colwidth]` → `colgroup>col[style:width]` 정규화 추가 |
| `src/lib/rich-editor/sanitize-html.ts` | 화이트리스트 확장(`<input type="checkbox">`, `<label>`, `data-*`) + `<input>` type=checkbox만 통과시키는 hook 추가 |
| `src/app/globals.css` | `rich-editor-progress` indeterminate keyframe 추가 |

---

# PR-1 — rich-editor 리네임 (동작 무변경)

이 PR은 디렉토리/파일/심볼 리네임만 한다. **타입체크·빌드·런타임 동작은 동일**해야 한다. PR-2의 본체 교체와 격리되어, 발생할 수 있는 회귀를 디렉토리 정리 작업과 분리한다.

---

### Task 1: `lib/block-editor/` → `lib/rich-editor/` 리네임

이 task는 `src/lib/block-editor/` 디렉토리만 리네임한다. 이 디렉토리 안의 5개 파일은 import 경로 외엔 변경 없다(다른 lib 파일에서 한 곳 — `inline-image-cleanup.ts` — 만 갱신 필요).

**Files:**
- Rename: `src/lib/block-editor/` → `src/lib/rich-editor/` (디렉토리 통째로)
- Modify: `src/lib/inline-image-cleanup.ts:21` (import 경로)

- [ ] **Step 1: 디렉토리 git mv**

```bash
git mv src/lib/block-editor src/lib/rich-editor
```

- [ ] **Step 2: `inline-image-cleanup.ts`의 import 경로 갱신**

기존:
```ts
import { extractInlineImageIds } from "@/lib/block-editor/extract-inline-image-ids";
```

변경 후:
```ts
import { extractInlineImageIds } from "@/lib/rich-editor/extract-inline-image-ids";
```

- [ ] **Step 3: 누락 import 확인**

```bash
git grep -n "@/lib/block-editor" -- 'src/**'
```

기대: 출력 0줄.

만약 다른 사이트가 발견되면 같은 방식으로 `@/lib/block-editor` → `@/lib/rich-editor` 로 일괄 치환 후 다시 grep.

---

### Task 2: `components/common/block-editor/` → `rich-editor/` 리네임 + 심볼명 변경

5개 파일 이름을 갈고, 그 안의 심볼/문자열을 `BlockEditor*` → `RichEditor*`로 변경한다. 외부 import는 task 3에서 처리.

**Files:**
- Rename: `src/components/common/block-editor/` → `src/components/common/rich-editor/`
- Rename: 디렉토리 안 5개 파일 (`block-editor.tsx` → `rich-editor.tsx`, `block-editor-loader.tsx` → `rich-editor-loader.tsx`, `block-editor-skeleton.tsx` → `rich-editor-skeleton.tsx`, `block-editor.types.ts` → `rich-editor.types.ts`, `index.ts` 그대로)
- Modify: 위 5개 파일 안의 심볼/import/로그 prefix

- [ ] **Step 1: 디렉토리 git mv**

```bash
git mv src/components/common/block-editor src/components/common/rich-editor
```

- [ ] **Step 2: 파일 4개 git mv**

```bash
cd src/components/common/rich-editor
git mv block-editor.tsx rich-editor.tsx
git mv block-editor-loader.tsx rich-editor-loader.tsx
git mv block-editor-skeleton.tsx rich-editor-skeleton.tsx
git mv block-editor.types.ts rich-editor.types.ts
cd -
```

- [ ] **Step 3: `rich-editor.types.ts` 심볼 리네임**

`BlockEditorProps` → `RichEditorProps`. 전체 파일을 다음으로 교체:

```ts
export interface RichEditorProps {
  /**
   * 초기 HTML 값. 마운트 시점에만 사용되며 이후는 에디터 내부 상태가 source of truth.
   * 외부에서 폼을 reset하려면 부모에서 컴포넌트 트리를 리마운트(`key` prop 변경)해야 한다.
   */
  defaultValue: string;
  /** 본문이 변경될 때마다 호출. 인자는 에디터가 출력한 풀 HTML 문자열. */
  onChange: (html: string) => void;
  /**
   * 마운트 시점 초기 HTML을 에디터 노드로 파싱하다 실패한 경우 호출.
   * 호출되면 에디터는 빈 상태로 시작하므로, 호출자는 사용자에게 알려 원본 덮어쓰기로 인한 데이터 손실을 방지해야 한다.
   */
  onParseError?: (error: unknown) => void;
  /** 비어 있을 때 표시할 안내 문구. */
  placeholder?: string;
  /** false면 readonly. */
  editable?: boolean;
  /** 외곽 컨테이너에 부여할 aria-label. */
  ariaLabel?: string;
  /**
   * 본문 임베드 이미지 업로드 실패 시 호출.
   * 호출자에서 사용자 노출 alert(일본어)을 띄워 데이터 손실 가능성을 안내해야 한다.
   */
  onUploadError?: (error: unknown) => void;
}
```

- [ ] **Step 4: `rich-editor-skeleton.tsx` 컴포넌트명 리네임**

함수명만 `BlockEditorSkeleton` → `RichEditorSkeleton`. 전체 파일을 다음으로 교체:

```tsx
"use client";

/**
 * RichEditor 동적 import 로딩 중 표시되는 placeholder.
 * 본문 영역과 같은 최소 높이를 잡아 layout shift를 최소화한다.
 */
export function RichEditorSkeleton() {
  return (
    <div
      role="status"
      aria-label="エディタを読み込み中"
      className="w-full min-h-[150px] px-4 py-4 border border-[#EBEBEB] rounded-[6px] bg-white"
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

- [ ] **Step 5: `rich-editor-loader.tsx` 리네임**

전체 파일을 다음으로 교체:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { RichEditorProps } from "./rich-editor.types";
import { RichEditorSkeleton } from "./rich-editor-skeleton";

const DynamicRichEditor = dynamic<RichEditorProps>(
  () => import("./rich-editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => <RichEditorSkeleton />,
  },
);

export function RichEditorLoader(props: RichEditorProps) {
  return <DynamicRichEditor {...props} />;
}
```

- [ ] **Step 6: `index.ts` 갱신**

전체 파일을 다음으로 교체:

```ts
export { RichEditorLoader } from "./rich-editor-loader";
export { RichEditorSkeleton } from "./rich-editor-skeleton";
export type { RichEditorProps } from "./rich-editor.types";
```

- [ ] **Step 7: `rich-editor.tsx` 내부 심볼/로그/import 일괄 갱신 (PR-1 단계 — 동작 무변경)**

PR-1에서는 BlockNote 코드를 그대로 두고 **심볼명·로그 prefix만 변경**한다. 다음 5곳을 sed/Edit로 일괄 변경:

| 변경 대상 | 변경 전 → 변경 후 |
|---|---|
| 컴포넌트 함수명 | `export function BlockEditor` → `export function RichEditor` |
| 기본 export | `export default BlockEditor;` → `export default RichEditor;` |
| Props 타입 import | `import type { BlockEditorProps } from "./block-editor.types";` → `import type { RichEditorProps } from "./rich-editor.types";` |
| Props 타입 사용 | `}: BlockEditorProps) {` → `}: RichEditorProps) {` |
| lib import | `from "@/lib/block-editor/allowed-blocks"` 와 `from "@/lib/block-editor/prepare-body-for-editor"` → 각각 `@/lib/rich-editor/allowed-blocks`, `@/lib/rich-editor/prepare-body-for-editor` |
| 콘솔 로그 prefix | `"[BlockEditor]"` 모든 발생을 `"[RichEditor]"`로 |

```bash
# 검증: 변경 누락 없이 처리되었는지
git grep -n "BlockEditor\|@/lib/block-editor\|\[BlockEditor\]" src/components/common/rich-editor
```

기대: 출력 0줄.

---

### Task 3: 외부 임포트 사이트 4곳 갱신

**Files:**
- Modify: `src/components/contents/create/contents-form-editor.tsx`
- Modify: `src/components/contents/create/contents-form.tsx`
- Modify: `src/components/contents/detail/contents-detail-body.tsx`
- Modify: `src/lib/inline-image-cleanup.ts` (Task 1에서 처리됨 — 여기서 재확인)

- [ ] **Step 1: `contents-form-editor.tsx` 갱신**

기존(line 4):
```ts
import { BlockEditorLoader } from "@/components/common/block-editor";
```

변경 후:
```ts
import { RichEditorLoader } from "@/components/common/rich-editor";
```

같은 파일 line 44 사용처:
```tsx
<BlockEditorLoader
```
→
```tsx
<RichEditorLoader
```

- [ ] **Step 2: `contents-form.tsx` 갱신**

기존(line 9):
```ts
import { isHtmlEmpty } from "@/lib/block-editor/is-html-empty";
```

변경 후:
```ts
import { isHtmlEmpty } from "@/lib/rich-editor/is-html-empty";
```

- [ ] **Step 3: `contents-detail-body.tsx` 갱신**

기존(line 3-4):
```ts
import { prepareBodyForRender } from "@/lib/block-editor/prepare-body-for-render";
import { sanitizeContentHtml } from "@/lib/block-editor/sanitize-html";
```

변경 후:
```ts
import { prepareBodyForRender } from "@/lib/rich-editor/prepare-body-for-render";
import { sanitizeContentHtml } from "@/lib/rich-editor/sanitize-html";
```

- [ ] **Step 4: 잔존 `block-editor` 참조 검색**

```bash
git grep -n "block-editor\|BlockEditor\|BlockEditorProps\|BlockEditorLoader\|BlockEditorSkeleton\|\[BlockEditor\]" -- 'src/**'
```

기대: 출력 0줄. 한 줄이라도 출력되면 그 위치를 갱신한 뒤 다시 실행.

---

### Task 4: PR-1 검증 + 커밋

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: TypeScript 빌드 검증**

```bash
pnpm build
```

기대: 빌드 성공. 실패하면 누락된 import 경로/심볼 갱신을 찾아 처리.

- [ ] **Step 2: ESLint 검증**

```bash
pnpm lint
```

기대: 경고/에러 0.

- [ ] **Step 3: 수동 동작 확인 (BlockNote 그대로 동작해야 함)**

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000/contents/create` 진입 → 다음 항목 확인:

1. 페이지가 정상 로드된다(BlockEditorSkeleton → BlockNote 마운트).
2. 텍스트 입력 → 저장 → 상세 페이지에서 정상 표시.
3. 콘솔에 `[RichEditor]` prefix 로그가 발생하면 그것도 정상(이전 `[BlockEditor]`만 안 보이면 OK).
4. 콘솔에 import 실패/`undefined is not a function` 류 에러 없음.

dev 서버를 멈춘다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: block-editor 디렉토리·심볼을 rich-editor로 리네임

Tiptap 마이그레이션 사전 단계 — 디렉토리/심볼/로그 prefix를
모두 rich-editor 로 통일. 동작·의존성 변경 없음.

- src/components/common/block-editor → rich-editor
- src/lib/block-editor → rich-editor
- BlockEditor* 심볼 → RichEditor*
- 콘솔 로그 prefix [BlockEditor] → [RichEditor]
- 외부 임포트 4곳(contents-form/detail-body, inline-image-cleanup) 갱신

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PR-2 — BlockNote → Tiptap 본체 교체

이 PR은 BlockNote 의존성을 제거하고 Tiptap headless로 본체를 갈아끼운다. PR-1 머지 후 진행.

---

### Task 5: 의존성 swap

**Files:**
- Modify: `package.json`

- [ ] **Step 1: BlockNote 의존성 제거**

```bash
pnpm remove @blocknote/core @blocknote/react @blocknote/mantine
```

- [ ] **Step 2: Tiptap 의존성 추가 (v2 핀)**

본 plan의 코드는 Tiptap v2 API(`@tiptap/core` Extension.create, `@tiptap/suggestion` default export, `useEditor` `immediatelyRender` 옵션 등)를 가정한다. v3 자동 설치를 막기 위해 명시적으로 `^2`를 핀한다.

```bash
pnpm add @tiptap/core@^2 @tiptap/pm@^2 @tiptap/react@^2 @tiptap/starter-kit@^2 \
  @tiptap/extension-image@^2 @tiptap/extension-table@^2 @tiptap/extension-table-row@^2 \
  @tiptap/extension-table-header@^2 @tiptap/extension-table-cell@^2 \
  @tiptap/extension-placeholder@^2 @tiptap/suggestion@^2 \
  tippy.js@^6
```

- [ ] **Step 3: lockfile 검증**

```bash
git diff --stat package.json pnpm-lock.yaml
```

기대: `package.json` 의존성에서 `@blocknote/*` 제거되고 `@tiptap/*`, `tippy.js` 추가됨.

- [ ] **Step 4: 임시 빌드 — 다음 task 진행 전 의존성만 깔린 상태 확인**

```bash
pnpm install
```

`pnpm build`는 이 시점에 실패한다(아직 `rich-editor.tsx`가 BlockNote import 중). 다음 task에서 본체를 교체한 뒤 통합 검증한다.

(이 task는 별도 commit 하지 않는다 — task 16에서 PR-2 전체를 하나 또는 여러 logical commit으로 묶는다.)

---

### Task 6: globals.css에 progress keyframe 추가

**Files:**
- Modify: `src/app/globals.css` (마지막 부분에 추가)

- [ ] **Step 1: keyframe·class 추가**

`src/app/globals.css` 파일의 가장 마지막에 다음 블록을 그대로 추가:

```css
/* RichEditor — 인라인 이미지 업로드 중 외곽 1px indeterminate progress */
@keyframes rich-editor-progress-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.rich-editor-progress {
  animation: rich-editor-progress-indeterminate 1.2s linear infinite;
}
```

---

### Task 7: `prepareBodyForRender` — colwidth → colgroup 정규화

**Files:**
- Modify: `src/lib/rich-editor/prepare-body-for-render.ts`

- [ ] **Step 1: 파일 전체를 다음으로 교체**

```ts
/**
 * 상세 페이지 본문 렌더 직전 전처리.
 *
 * - 레거시 plain-text 줄바꿈(\n)을 <br>로 변환해 시각적 줄바꿈 보존.
 * - Tiptap이 출력하는 td[colwidth]를 BlockNote 호환 colgroup>col[style="width:Npx"]로 변환 →
 *   detail CSS([&_table]:table-fixed)가 두 마크업에서 동일하게 동작.
 *
 * sanitize는 별도 책임이다 — 결과를 반드시 sanitizeContentHtml에 통과시킨 뒤 렌더해야 한다.
 */
export function prepareBodyForRender(body: string | null | undefined): string {
  if (!body) return "";
  const withBr = body.replace(/\n/g, "<br>");
  return normalizeTiptapTableWidths(withBr);
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
```

---

### Task 8: `sanitize-html` 화이트리스트 확장

**Files:**
- Modify: `src/lib/rich-editor/sanitize-html.ts`

- [ ] **Step 1: 파일 전체를 다음으로 교체**

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
    // inline style — 표 관련 태그의 width/height 류만 허용
    if (data.attrName === "style") {
      if (!STYLE_ALLOWED_TAGS.has(node.tagName) || !SAFE_TABLE_STYLE_PATTERN.test(data.attrValue)) {
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
```

---

### Task 9: `editor-i18n.ts` 신규

**Files:**
- Create: `src/components/common/rich-editor/editor-i18n.ts`

- [ ] **Step 1: 파일 작성**

```ts
/**
 * RichEditor 내부에서 사용하는 일본어 라벨/메시지 사전.
 * 변경/번역이 한 곳에서 일어나도록 모든 사용자 대면 문자열을 모은다.
 */
export const editorI18n = {
  toolbar: {
    blockType: "ブロックタイプ",
    paragraph: "段落",
    heading1: "見出し 1",
    heading2: "見出し 2",
    heading3: "見出し 3",
    bold: "太字",
    italic: "斜体",
    strike: "取消線",
    inlineCode: "インラインコード",
    bulletList: "箇条書きリスト",
    orderedList: "番号付きリスト",
    blockquote: "引用",
    codeBlock: "コードブロック",
    image: "画像",
    table: "テーブル",
    undo: "元に戻す",
    redo: "やり直し",
    shortcuts: {
      bold: "Cmd/Ctrl+B",
      italic: "Cmd/Ctrl+I",
      strike: "Cmd/Ctrl+Shift+S",
      inlineCode: "Cmd/Ctrl+E",
      undo: "Cmd/Ctrl+Z",
      redo: "Cmd/Ctrl+Shift+Z",
    },
  },
  slash: {
    empty: "該当する項目がありません",
    items: {
      paragraph: { title: "段落", keywords: ["paragraph", "p", "text"] },
      heading1: { title: "見出し 1", keywords: ["h1", "heading"] },
      heading2: { title: "見出し 2", keywords: ["h2", "heading"] },
      heading3: { title: "見出し 3", keywords: ["h3", "heading"] },
      bulletList: { title: "箇条書きリスト", keywords: ["bullet", "ul", "list"] },
      orderedList: { title: "番号付きリスト", keywords: ["number", "ol", "list"] },
      blockquote: { title: "引用", keywords: ["quote", "blockquote"] },
      codeBlock: { title: "コードブロック", keywords: ["code", "codeblock"] },
      image: { title: "画像", keywords: ["image", "img"] },
      table: { title: "テーブル", keywords: ["table"] },
    },
  },
  ariaLabels: {
    toolbar: "リッチテキストツールバー",
    editor: "リッチテキスト本文",
  },
} as const;

export type SlashItemKey = keyof typeof editorI18n.slash.items;
```

---

### Task 10: `inline-image-paste.ts` 신규

**Files:**
- Create: `src/components/common/rich-editor/inline-image-paste.ts`

- [ ] **Step 1: 파일 작성**

```ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface InlineImagePasteOptions {
  /** File을 받아 업로드하고 결과 URL을 반환. 실패 시 reject. */
  upload: (file: File) => Promise<string>;
  /** 업로드 실패 시 호출 — 호출자에서 사용자 alert을 띄운다. */
  onError: (error: unknown) => void;
  /** 업로드 진행 중 여부 토글 — 호출자에서 외곽 1px progress 표시에 사용. */
  onUploadingChange: (uploading: boolean) => void;
}

const pluginKey = new PluginKey("inline-image-paste");

/**
 * paste/drop 이벤트에서 image File을 추출해 자동 업로드하는 ProseMirror plugin.
 *
 * 동작:
 *   1. paste/drop에서 image/* File 추출
 *   2. preventDefault — 브라우저 기본 동작 차단
 *   3. Promise.allSettled로 모든 업로드 시도 → 성공만 한 번에 insertContent
 *   4. 실패 분은 onError로 호출자에 전파
 *
 * 임시 placeholder 노드를 만들지 않으므로 onChange가 1회만 발생하고,
 * inline-image-cleanup이 임시 src를 잘못 수집할 위험이 0.
 */
export const InlineImagePaste = Extension.create<InlineImagePasteOptions>({
  name: "inlineImagePaste",

  addOptions() {
    return {
      upload: async () => "",
      onError: () => {},
      onUploadingChange: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { upload, onError, onUploadingChange } = this.options;
    const editor = this.editor;

    const handleFiles = async (files: File[]): Promise<void> => {
      onUploadingChange(true);
      try {
        const results = await Promise.allSettled(files.map(upload));
        const urls: string[] = [];
        for (const r of results) {
          if (r.status === "fulfilled") urls.push(r.value);
          else onError(r.reason);
        }
        if (urls.length > 0) {
          editor
            .chain()
            .focus()
            .insertContent(urls.map((src) => ({ type: "image", attrs: { src } })))
            .run();
        }
      } finally {
        onUploadingChange(false);
      }
    };

    return [
      new Plugin({
        key: pluginKey,
        props: {
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const files = items
              .filter((it) => it.kind === "file")
              .map((it) => it.getAsFile())
              .filter((f): f is File => !!f && f.type.startsWith("image/"));
            if (files.length === 0) return false;
            event.preventDefault();
            void handleFiles(files);
            return true;
          },
          handleDrop(_view, event) {
            const dt = (event as DragEvent).dataTransfer;
            if (!dt) return false;
            const files = Array.from(dt.files).filter((f) => f.type.startsWith("image/"));
            if (files.length === 0) return false;
            event.preventDefault();
            void handleFiles(files);
            return true;
          },
        },
      }),
    ];
  },
});
```

---

### Task 11: `editor-slash-menu.tsx` 신규

이 파일에는 (a) 슬래시 메뉴 React 컴포넌트, (b) 메뉴 항목 정의, (c) `SlashCommand` Tiptap extension 세 가지가 모두 들어 있다. 한 파일로 묶는 이유: 셋이 모두 슬래시 메뉴 한 가지 책임 안에 있고 서로만 참조하기 때문이다.

**Files:**
- Create: `src/components/common/rich-editor/editor-slash-menu.tsx`

- [ ] **Step 1: 파일 작성**

```tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { editorI18n, type SlashItemKey } from "./editor-i18n";

// ============================================================================
// 메뉴 항목 정의
// ============================================================================

interface SlashItem {
  key: SlashItemKey;
  title: string;
  keywords: readonly string[];
  command: (args: { editor: Editor; range: Range }) => void;
}

function buildItems(triggerImagePicker: () => void): SlashItem[] {
  const i = editorI18n.slash.items;
  return [
    {
      key: "paragraph",
      title: i.paragraph.title,
      keywords: i.paragraph.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
    },
    {
      key: "heading1",
      title: i.heading1.title,
      keywords: i.heading1.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      key: "heading2",
      title: i.heading2.title,
      keywords: i.heading2.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      key: "heading3",
      title: i.heading3.title,
      keywords: i.heading3.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      key: "bulletList",
      title: i.bulletList.title,
      keywords: i.bulletList.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      key: "orderedList",
      title: i.orderedList.title,
      keywords: i.orderedList.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      key: "blockquote",
      title: i.blockquote.title,
      keywords: i.blockquote.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      key: "codeBlock",
      title: i.codeBlock.title,
      keywords: i.codeBlock.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      key: "image",
      title: i.image.title,
      keywords: i.image.keywords,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        triggerImagePicker();
      },
    },
    {
      key: "table",
      title: i.table.title,
      keywords: i.table.keywords,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];
}

function filterItems(query: string, all: SlashItem[]): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q)),
  );
}

// ============================================================================
// MenuList — tippy 안에 렌더되는 React 컴포넌트
// ============================================================================

interface MenuListHandle {
  onKeyDown: (e: { event: KeyboardEvent }) => boolean;
}

interface MenuListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

const MenuList = forwardRef<MenuListHandle, MenuListProps>(function MenuList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[selected]) command(items[selected]);
          return true;
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  if (items.length === 0) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-[6px] shadow-md py-2 px-3 font-['Noto_Sans_JP'] text-[13px] text-[#999]">
        {editorI18n.slash.empty}
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EBEBEB] rounded-[6px] shadow-md py-1 font-['Noto_Sans_JP'] text-[14px] text-[#101010] min-w-[200px] max-h-[280px] overflow-y-auto">
      {items.map((item, idx) => (
        <button
          key={item.key}
          type="button"
          onClick={() => command(item)}
          onMouseEnter={() => setSelected(idx)}
          className={`block w-full text-left px-3 py-2 transition-colors ${
            idx === selected ? "bg-[#F4F4F4]" : "bg-transparent"
          }`}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
});

// ============================================================================
// SlashCommand — Tiptap extension
// ============================================================================

export interface SlashCommandOptions {
  /** 슬래시 메뉴에서 画像 항목을 골랐을 때 호출. 호출자가 file picker를 띄운다. */
  triggerImagePicker: () => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      triggerImagePicker: () => {},
    };
  },

  addProseMirrorPlugins() {
    const triggerImagePicker = this.options.triggerImagePicker;
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items: ({ query }) => filterItems(query, buildItems(triggerImagePicker)).slice(0, 10),
        command: ({ editor, range, props }) => {
          (props as SlashItem).command({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<MenuListHandle, MenuListProps> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(MenuList, {
                props: {
                  items: props.items as SlashItem[],
                  command: (item) => props.command(item),
                },
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy("body", {
                getReferenceClientRect: () => props.clientRect?.() as DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                arrow: false,
              });
            },
            onUpdate(props) {
              component?.updateProps({
                items: props.items as SlashItem[],
                command: (item) => props.command(item),
              });
              if (props.clientRect) {
                popup?.[0]?.setProps({
                  getReferenceClientRect: () => props.clientRect?.() as DOMRect,
                });
              }
            },
            onKeyDown(props) {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
```

- [ ] **Step 2: tippy.js CSS import 위치 검토**

`tippy.js`는 기본 테마 CSS가 별도다. 본 파일은 자체 스타일링(흰 배경 카드)을 쓰므로 tippy 기본 CSS는 import하지 않는다(arrow: false, 기본 background를 우리 카드가 덮는다). 만약 위치 잘림/그림자가 어색하면 다음 task 13(rich-editor.tsx) 작성 후 수동 회귀 시 검토.

---

### Task 12: `editor-extensions.ts` 신규

**Files:**
- Create: `src/components/common/rich-editor/editor-extensions.ts`

- [ ] **Step 1: 파일 작성**

```ts
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import { InlineImagePaste } from "./inline-image-paste";
import { SlashCommand } from "./editor-slash-menu";

export interface BuildExtensionsOptions {
  placeholder?: string;
  uploadInlineImage: (file: File) => Promise<string>;
  onUploadError: (error: unknown) => void;
  onUploadingChange: (uploading: boolean) => void;
  triggerImagePicker: () => void;
}

/**
 * RichEditor가 사용할 Tiptap extension 화이트리스트.
 *
 * 허용 블록(스펙 §6과 1:1 매핑):
 *   paragraph / heading L1~3 / bulletList / orderedList / blockquote / codeBlock /
 *   table / image (URL only)
 *
 * 비활성: video / audio / file / pageBreak / taskList / taskItem
 *   - StarterKit·extension-table 등에 처음부터 포함되지 않거나 본 함수에서 추가하지 않음.
 *
 * StarterKit 부산물(HardBreak, History undo/redo, Bold/Italic/Strike/Code)은 그대로 활성.
 */
export function buildExtensions(opts: BuildExtensionsOptions) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "rich-editor-inline-image" },
    }),
    Table.configure({
      resizable: true,
      HTMLAttributes: { class: "rich-editor-table" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: opts.placeholder ?? "",
      showOnlyWhenEditable: true,
      includeChildren: false,
    }),
    InlineImagePaste.configure({
      upload: opts.uploadInlineImage,
      onError: opts.onUploadError,
      onUploadingChange: opts.onUploadingChange,
    }),
    SlashCommand.configure({
      triggerImagePicker: opts.triggerImagePicker,
    }),
  ];
}
```

---

### Task 13: `editor-toolbar.tsx` 신규

**Files:**
- Create: `src/components/common/rich-editor/editor-toolbar.tsx`

- [ ] **Step 1: 파일 작성**

```tsx
"use client";

import { type Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";

export interface EditorToolbarProps {
  editor: Editor;
  /** G5 画像 버튼 클릭 시 호출 — 호출자가 숨겨진 file input을 트리거한다. */
  onImageRequest: () => void;
}

/**
 * 상단 고정 툴바.
 * 그룹 구성(스펙 §11.2):
 *   G1 블록 타입 드롭다운 / G2 인라인 / G3 리스트 / G4 블록 / G5 삽입 / G6 히스토리
 * 좌측 블록 핸들·BubbleMenu는 사용하지 않음 (스펙 §3.4).
 */
export function EditorToolbar({ editor, onImageRequest }: EditorToolbarProps) {
  const t = editorI18n.toolbar;

  const blockValue: "paragraph" | "h1" | "h2" | "h3" = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
    ? "h3"
    : "paragraph";

  const setBlock = (value: string) => {
    const chain = editor.chain().focus();
    if (value === "paragraph") chain.setParagraph().run();
    else if (value === "h1") chain.setHeading({ level: 1 }).run();
    else if (value === "h2") chain.setHeading({ level: 2 }).run();
    else if (value === "h3") chain.setHeading({ level: 3 }).run();
  };

  const isEditable = editor.isEditable;

  const btnBase =
    "flex items-center justify-center w-9 h-9 rounded transition-colors text-[14px] text-[#101010]";
  const btn = (active: boolean, disabled = false) =>
    `${btnBase} ${
      active ? "bg-[#F4F4F4]" : "bg-transparent hover:bg-[#FAFAFA]"
    } ${disabled || !isEditable ? "opacity-40 pointer-events-none" : ""}`;

  const divider = <div className="w-px h-5 bg-[#EBEBEB] mx-1" aria-hidden="true" />;

  return (
    <div
      role="toolbar"
      aria-label={editorI18n.ariaLabels.toolbar}
      className="flex items-center gap-1 px-2 py-1 border-b border-[#EBEBEB] flex-wrap font-['Noto_Sans_JP']"
    >
      {/* G1 — 블록 타입 드롭다운 */}
      <select
        aria-label={t.blockType}
        value={blockValue}
        onChange={(e) => setBlock(e.target.value)}
        disabled={!isEditable}
        className="h-9 px-2 rounded border border-[#EBEBEB] bg-white text-[13px] text-[#101010] disabled:opacity-40"
      >
        <option value="paragraph">{t.paragraph}</option>
        <option value="h1">{t.heading1}</option>
        <option value="h2">{t.heading2}</option>
        <option value="h3">{t.heading3}</option>
      </select>

      {divider}

      {/* G2 — 인라인 */}
      <button
        type="button"
        aria-label={t.bold}
        title={`${t.bold} (${t.shortcuts.bold})`}
        className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        aria-label={t.italic}
        title={`${t.italic} (${t.shortcuts.italic})`}
        className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </button>
      <button
        type="button"
        aria-label={t.strike}
        title={`${t.strike} (${t.shortcuts.strike})`}
        className={btn(editor.isActive("strike"))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </button>
      <button
        type="button"
        aria-label={t.inlineCode}
        title={`${t.inlineCode} (${t.shortcuts.inlineCode})`}
        className={btn(editor.isActive("code"))}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <span className="font-mono text-[12px]">{`</>`}</span>
      </button>

      {divider}

      {/* G3 — 리스트 */}
      <button
        type="button"
        aria-label={t.bulletList}
        title={t.bulletList}
        className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        ・
      </button>
      <button
        type="button"
        aria-label={t.orderedList}
        title={t.orderedList}
        className={btn(editor.isActive("orderedList"))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </button>

      {divider}

      {/* G4 — 블록 */}
      <button
        type="button"
        aria-label={t.blockquote}
        title={t.blockquote}
        className={btn(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>
      <button
        type="button"
        aria-label={t.codeBlock}
        title={t.codeBlock}
        className={btn(editor.isActive("codeBlock"))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <span className="font-mono text-[12px]">{`{ }`}</span>
      </button>

      {divider}

      {/* G5 — 삽입 */}
      <button
        type="button"
        aria-label={t.image}
        title={t.image}
        className={btn(false)}
        onClick={onImageRequest}
        disabled={!isEditable}
      >
        🖼
      </button>
      <button
        type="button"
        aria-label={t.table}
        title={t.table}
        className={btn(false)}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        disabled={!isEditable}
      >
        ▦
      </button>

      {divider}

      {/* G6 — 히스토리 */}
      <button
        type="button"
        aria-label={t.undo}
        title={`${t.undo} (${t.shortcuts.undo})`}
        className={btn(false, !editor.can().undo())}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!isEditable || !editor.can().undo()}
      >
        ↶
      </button>
      <button
        type="button"
        aria-label={t.redo}
        title={`${t.redo} (${t.shortcuts.redo})`}
        className={btn(false, !editor.can().redo())}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!isEditable || !editor.can().redo()}
      >
        ↷
      </button>
    </div>
  );
}
```

---

### Task 14: `rich-editor.tsx` Tiptap 본체로 재작성

**Files:**
- Modify: `src/components/common/rich-editor/rich-editor.tsx` (전체 교체)

- [ ] **Step 1: 파일 전체를 다음으로 교체**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import api from "@/lib/axios";
import { prepareBodyForEditor } from "@/lib/rich-editor/prepare-body-for-editor";
import { buildExtensions } from "./editor-extensions";
import { EditorToolbar } from "./editor-toolbar";
import { editorI18n } from "./editor-i18n";
import type { RichEditorProps } from "./rich-editor.types";

export function RichEditor({
  defaultValue,
  onChange,
  onParseError,
  onUploadError,
  placeholder,
  editable = true,
  ariaLabel,
}: RichEditorProps) {
  // 부모가 매 렌더마다 새 함수를 넘겨도 extension이 재생성되지 않도록 ref로 잡는다.
  const onUploadErrorRef = useRef(onUploadError);
  const onParseErrorRef = useRef(onParseError);
  useEffect(() => {
    onUploadErrorRef.current = onUploadError;
  }, [onUploadError]);
  useEffect(() => {
    onParseErrorRef.current = onParseError;
  }, [onParseError]);

  // 마운트 시점의 defaultValue만 캡처 — 이후는 에디터 내부 상태가 진실의 원천.
  const initialValueRef = useRef(defaultValue);

  // 마운트 단계의 setContent로 인한 자동 emit을 부모로 전파하지 않기 위한 가드.
  const isMountedRef = useRef(false);

  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const uploadInlineImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post<{ data: { id: number; url: string } }>(
      "/inline-images",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data.data.url;
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: buildExtensions({
      placeholder,
      uploadInlineImage,
      onUploadError: (e) => onUploadErrorRef.current?.(e),
      onUploadingChange: setIsUploading,
      triggerImagePicker,
    }),
    onUpdate: ({ editor: ed }) => {
      if (!isMountedRef.current) return;
      try {
        const html = ed.getHTML();
        onChange(html);
      } catch (error: unknown) {
        // 한 번의 콜백 실패가 listener loop를 침묵시키지 않도록 가둔다.
        console.error("[RichEditor] onChange 처리 실패:", error);
      }
    },
  });

  // 초기 본문 주입 — 마운트 시 1회. 실패 시 onParseError로 부모에 알림.
  useEffect(() => {
    if (!editor) return;
    const html = prepareBodyForEditor(initialValueRef.current);
    if (html) {
      try {
        editor.commands.setContent(html, { emitUpdate: false });
      } catch (error: unknown) {
        // 비정상 HTML로 파싱 실패 시 빈 doc 으로 시작.
        console.error("[RichEditor] 초기 본문 파싱 실패:", error);
        onParseErrorRef.current?.(error);
      }
    }
    isMountedRef.current = true;
  }, [editor]);

  // editable prop 변화 반영
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // 툴바·슬래시 메뉴의 画像 버튼이 호출하는 file picker 결과 처리.
  const handleImagePickerChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능하게
    if (!file || !editor) return;
    setIsUploading(true);
    try {
      const url = await uploadInlineImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (error: unknown) {
      console.error("[RichEditor] inline image upload failed:", error);
      onUploadErrorRef.current?.(error);
    } finally {
      setIsUploading(false);
    }
  };

  if (!editor) return null;

  return (
    <div
      aria-label={ariaLabel ?? editorI18n.ariaLabels.editor}
      data-uploading={isUploading ? "true" : "false"}
      className="relative w-full min-h-[150px] border border-[#EBEBEB] rounded-[6px] bg-white transition-colors duration-150 hover:border-[#D1D1D1] focus-within:border-[#101010] overflow-hidden"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleImagePickerChange(e);
        }}
      />
      {/* 1px indeterminate progress bar — globals.css의 .rich-editor-progress 사용 */}
      <div
        aria-hidden="true"
        className={`absolute top-0 left-0 right-0 h-[1px] overflow-hidden pointer-events-none transition-opacity duration-150 ${
          isUploading ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="rich-editor-progress h-full bg-[#101010]" />
      </div>
      <EditorToolbar editor={editor} onImageRequest={triggerImagePicker} />
      <EditorContent
        editor={editor}
        className="px-4 py-3 prose prose-sm max-w-none font-['Noto_Sans_JP'] [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[120px]"
      />
    </div>
  );
}

export default RichEditor;
```

---

### Task 15: `allowed-blocks.ts` 삭제

**Files:**
- Delete: `src/lib/rich-editor/allowed-blocks.ts`

- [ ] **Step 1: 잔존 import 검색**

```bash
git grep -n "allowed-blocks\|allowedBlocksSchema" -- 'src/**'
```

기대: 출력 0줄(rich-editor.tsx의 BlockNote 코드는 task 14에서 이미 제거됨).

만약 출력이 있으면 해당 사이트를 먼저 정리한 뒤 다음 단계 진행.

- [ ] **Step 2: 파일 삭제**

```bash
git rm src/lib/rich-editor/allowed-blocks.ts
```

---

### Task 16: PR-2 통합 검증 + 커밋

**Files:** (변경 없음 — 검증·커밋만)

- [ ] **Step 1: TypeScript / 빌드 검증**

```bash
pnpm build
```

기대: 빌드 성공. 실패 시 에러 출력의 위치를 우선 처리.

- [ ] **Step 2: ESLint 검증**

```bash
pnpm lint
```

기대: 경고/에러 0.

- [ ] **Step 3: dev 서버 기동**

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속.

- [ ] **Step 4: 수동 회귀 체크리스트(스펙 §14.2 — 10/10)**

각 시나리오를 기록해두고, 실패 시 root cause를 찾아 수정 후 재실행.

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | `/contents/create` → 段落, H1~3, bullet list, ordered list, blockquote, codeBlock, table 3x3, image (툴바 아이콘) 한 번씩 입력 → 저장 → 상세 진입 | 모든 블록이 의도대로 렌더 |
| 2 | 새 글에 이미지 1장 paste → 저장 → 상세 | 정상 표시, alert 0, console error 0 |
| 3 | 새 글에 이미지 3장 동시 drop → 저장 → 상세 | 3장 정상, 1px progress 노출 후 소멸 |
| 4 | drop 시 1장만 큰 용량(서버 제한 초과)으로 강제 실패 → 나머지 삽입 + alert 1회 | 부분 성공, 실패 1건만 alert |
| 5 | 기존 BlockNote 글(이미 DB에 있는 콘텐츠) `/contents/{id}/edit` 진입 → 본문 그대로 표시 → 저장 → 상세 | lazy 마이그레이션 무손실 |
| 6 | BlockNote 글(테이블 포함, 너비 조정된 것) → 수정 진입 → 너비 보존 / 저장 → 상세 너비 보존 | colgroup 정규화 OK |
| 7 | 신규 글 — 본문 비운 채 저장 시도 | 기존 validation alert "内容は必須入力項目です。" |
| 8 | 손상 HTML이 들어 있는 콘텐츠(예: `<table><tr><td>` 미닫힘)을 강제로 DB 주입 후 수정 진입 | "[RichEditor] 초기 본문 파싱 실패" 콘솔 + onParseError alert |
| 9 | 권한 없는 사용자(SUPER_ADMIN 작성글에 ADMIN으로 진입 등)가 직접 URL 진입 | 기존 차단 alert + redirect 그대로 |
| 10 | `/contents/{id}` 상세를 PC 폭/모바일 폭에서 검수 | 모든 블록 정상 표시 |

dev 서버 종료.

- [ ] **Step 5: 커밋 (의존성 + 본체 묶음)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: 본문 에디터를 BlockNote에서 Tiptap headless로 교체

스펙(docs/superpowers/specs/2026-05-04-tiptap-migration-design.md)에
따른 외과적 교체 — RichEditorProps 외부 계약 보존, lazy 마이그레이션
(DB 변경 없음).

핵심 변경:
- 의존성: @blocknote/* 제거, @tiptap/* + tippy.js 추가
- rich-editor.tsx 본체를 Tiptap useEditor 기반으로 재작성
  (마운트 setContent 가드, onChange ref 캡처 패턴 유지)
- 신규: editor-i18n / editor-extensions / editor-toolbar /
  editor-slash-menu / inline-image-paste
- prepareBodyForRender: td[colwidth] → colgroup 정규화로 detail
  CSS 호환 유지
- sanitize-html: <input type="checkbox"> · <label> · data-* 화이트리스트
  추가, type=checkbox 외 input은 element 자체 제거
- globals.css: rich-editor-progress indeterminate keyframe
- allowed-blocks.ts 삭제

UI:
- 툴바(상단 고정) + 슬래시 메뉴 / 좌측 핸들·BubbleMenu 미사용
- Heading 드롭다운 / Noto Sans JP 통일 / 슬래시 트리거 hint 없음
- 인라인 이미지 paste/drop 자동 업로드 + 외곽 1px progress

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 체크리스트 (작성자 본인용)

이 plan을 머지 직전 다시 훑어 다음을 확인:

1. **스펙 커버리지**: 스펙의 각 절(§1~§19)이 task에 대응되는가?
   - §3 인터페이스 보존 — task 2 step 3
   - §4 디렉토리·심볼 리네임 — task 1, 2, 3
   - §5 의존성 — task 5
   - §6 블록 매핑 — task 12 (StarterKit heading 1~3, Image, Table, no taskList)
   - §7 데이터 흐름 — task 14 (setContent emitUpdate:false / onUpdate isMountedRef 가드 / getHTML)
   - §8 lazy 마이그레이션 — task 14의 setContent + task 7 prepareBodyForRender
   - §9 호환성 위험 — task 7 (테이블), task 8 (체크리스트 fallback)
   - §10 sanitize 화이트리스트 — task 8
   - §11 UI — task 9, 11, 13, 14
   - §12 인라인 이미지 — task 10, 14
   - §13 에러 처리 — task 14 (try-catch, ref 캡처)
   - §14 검증 — task 4 (PR-1), task 16 (PR-2)
   - §15 PR 분할 — PR-1: task 1~4 / PR-2: task 5~16
2. **Placeholder scan**: TBD/TODO/생략 없는가? — 모든 코드 블록이 완성된 ts/tsx임 확인
3. **타입 정합성**:
   - `RichEditorProps`: defaultValue/onChange/onParseError/onUploadError/placeholder/editable/ariaLabel — task 2 step 3에서 정의, task 14 사용
   - `BuildExtensionsOptions`: placeholder/uploadInlineImage/onUploadError/onUploadingChange/triggerImagePicker — task 12 정의, task 14 사용
   - `InlineImagePasteOptions`: upload/onError/onUploadingChange — task 10 정의, task 12 사용
   - `SlashCommandOptions`: triggerImagePicker — task 11 정의, task 12 사용
   - `EditorToolbarProps`: editor/onImageRequest — task 13 정의, task 14 사용
   - `editorI18n`: task 9 정의, task 11·13 사용 (`toolbar.*`, `slash.items.*`, `ariaLabels.*`)
4. **로그 prefix 일관성**: 모든 콘솔 로그가 `[RichEditor]` 또는 `[sanitizeContentHtml]` 사용 (task 14, task 8)

이 셀프 리뷰 결과 발견된 이슈는 inline 수정 후 commit.
