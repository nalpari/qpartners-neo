# 콘텐츠 본문 에디터: BlockNote → Tiptap 마이그레이션 설계

- 작성일: 2026-05-04
- 대상 화면: `/contents/create`, `/contents/[id]/edit` (그리고 영향 받는 `/contents/[id]` detail)
- 단일 사용처: `src/components/contents/create/contents-form-editor.tsx`

## 1. 동기와 목표

콘텐츠 본문 에디터를 BlockNote(`@blocknote/{core,react,mantine}` 0.49)에서 Tiptap(headless ProseMirror)으로 교체한다. 동기는 **메뉴(슬래시·툴바) 구성을 우리 디자인 토큰과 일본어 라벨로 직접 통제**하기 위함이다. 번들 축소나 신규 기능 추가는 부수 효과로만 본다.

성공 기준:

1. `/contents/create`·`/contents/[id]/edit`에서 작성·수정·저장이 BlockNote와 동등 이상의 UX로 동작한다.
2. 기존에 BlockNote로 저장된 본문을 그대로 열어 수정·재저장할 수 있다(데이터 손실 0).
3. detail 페이지가 BlockNote/Tiptap 양쪽 마크업을 모두 정상 렌더한다.
4. DB 마이그레이션은 수행하지 않는다(lazy 마이그레이션).
5. `RichEditorProps` 외부 계약은 한 글자도 변경하지 않는다.

비목표:

- 새로운 블록 타입 추가(예: 비디오, 임베드, 캘아웃)
- 코드 블록 syntax highlight 도입
- 다른 페이지(예: 공지·메일·댓글)에 에디터를 재사용하기 위한 추상화

## 2. 접근 방식: 외과적 교체

`src/components/common/block-editor/` 디렉토리 **내부 구현만** Tiptap으로 바꾼다. `BlockEditorProps` 계약은 그대로 유지하고, 외부 호출자는 손대지 않는다. 동기와 결을 맞춰 디렉토리·심볼명을 `rich-editor`로 리네임한다.

대안으로 검토 후 기각:

- **신규 컴포넌트 + Feature flag**: 단일 사용처에 두 의존성을 동시 유지하는 비용이 ROI 대비 너무 큼.
- **완전 재구성(Toolbar/Slash 추상화 모듈화)**: 사용처가 1곳뿐인 현 시점에는 단일 사용처 추상화 금지 원칙(Karpathy)에 위배.

## 3. 인터페이스 보존

`RichEditorProps`(현 `BlockEditorProps`)는 다음 필드를 한 글자도 변경하지 않는다.

- `defaultValue: string` — 마운트 시점 1회만 사용. 폼 리셋은 부모가 `key` prop으로 리마운트.
- `onChange: (html: string) => void` — Tiptap이 출력한 HTML을 그대로 전달.
- `onParseError?: (error: unknown) => void` — 마운트 시 본문 파싱 실패 알림.
- `onUploadError?: (error: unknown) => void` — 인라인 이미지 업로드 실패 알림.
- `placeholder?: string`, `editable?: boolean`, `ariaLabel?: string`

`/contents/...` 경로의 호출자(`contents-form-editor.tsx`, `contents-form.tsx`, `contents-detail-body.tsx`, `inline-image-cleanup.ts`) 코드 변경은 **임포트 경로와 심볼명 갱신**으로 한정된다.

## 4. 디렉토리·심볼 리네임

`src/components/common/block-editor/` → `src/components/common/rich-editor/`

```
rich-editor/
├── index.ts                    (그대로 — 외부 export)
├── rich-editor.types.ts        (이름 변경, Props 본문은 그대로)
├── rich-editor-loader.tsx      (그대로 — dynamic import + ssr:false)
├── rich-editor-skeleton.tsx    (그대로)
├── rich-editor.tsx             ★ Tiptap 구현으로 재작성
├── editor-extensions.ts        ★ 신규 — Tiptap extension 화이트리스트
├── editor-toolbar.tsx          ★ 신규 — 상단 고정 툴바
├── editor-slash-menu.tsx       ★ 신규 — 슬래시 커맨드(suggestion + tippy)
├── editor-i18n.ts              ★ 신규 — 일본어 라벨 사전
└── inline-image-paste.ts       ★ 신규 — paste/drop 자동 업로드 ProseMirror plugin
```

`src/lib/block-editor/` → `src/lib/rich-editor/`

```
rich-editor/
├── prepare-body-for-editor.ts   (그대로)
├── prepare-body-for-render.ts   ◇ td[colwidth] → colgroup 정규화 추가
├── sanitize-html.ts             ◇ Tiptap 화이트리스트 확장
├── is-html-empty.ts             (그대로)
└── extract-inline-image-ids.ts  (그대로)
```

`src/lib/block-editor/allowed-blocks.ts`는 `editor-extensions.ts`로 대체되어 **삭제**.

심볼: `BlockEditor*` → `RichEditor*` (`BlockEditorProps` → `RichEditorProps` 등). 콘솔 로그 prefix `[BlockEditor]` → `[RichEditor]`.

임포트 사이트(4곳):

- `src/components/contents/create/contents-form-editor.tsx`
- `src/components/contents/create/contents-form.tsx` (`is-html-empty`)
- `src/components/contents/detail/contents-detail-body.tsx` (`prepareBodyForRender`, `sanitizeContentHtml`)
- `src/lib/inline-image-cleanup.ts` (`extract-inline-image-ids`)

## 5. 의존성 변경

**제거**

```
@blocknote/core
@blocknote/react
@blocknote/mantine
```

**추가**

```
@tiptap/react
@tiptap/pm
@tiptap/starter-kit
@tiptap/extension-image
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-header
@tiptap/extension-table-cell
@tiptap/extension-placeholder
@tiptap/suggestion
tippy.js
```

체크리스트(TaskList) 비활성: `@tiptap/extension-task-list` / `task-item`은 추가하지 않는다.

## 6. 블록·extension 매핑

| 현재 BlockNote | Tiptap 매핑 | 비고 |
|---|---|---|
| paragraph | StarterKit · Paragraph | |
| heading 1~3 | StarterKit · Heading `levels: [1, 2, 3]` | 4~6 비활성 |
| bulletListItem | StarterKit · BulletList + ListItem | |
| numberedListItem | StarterKit · OrderedList + ListItem | |
| checkListItem | (비활성) | TaskList/TaskItem 도입 안 함 |
| quote | StarterKit · Blockquote | |
| codeBlock | StarterKit · CodeBlock | syntax highlight 없이 |
| table | extension-table + row/header/cell | |
| image (URL only) | extension-image | URL only — 기존 동일 |

StarterKit 부산물 — HardBreak, History(undo/redo), Bold/Italic/Strike/Code(인라인)은 **그대로 유지**한다.

비활성(video/audio/file/pageBreak)은 Tiptap 표준에 처음부터 포함되지 않아 자연 차단된다.

## 7. 데이터 흐름

```
[1] 입력 (마운트)
    DB body(HTML) → prepareBodyForEditor() → editor.commands.setContent(html)
                                              ↑ Tiptap의 HTML→ProseMirror 파서가 BlockNote HTML 흡수

[2] 변경 (편집 중)
    ProseMirror state → editor.getHTML() → onChange(html)   // 항상 Tiptap 표준 HTML
    가드: 마운트 setContent로 인한 첫 emit은 isMountedRef로 차단

[3] 출력 (저장)
    onChange로 받은 Tiptap HTML → POST/PUT /api/contents (body 필드)

[4] 렌더 (detail)
    DB body(HTML) → prepareBodyForRender() → sanitizeContentHtml() → dangerouslySetInnerHTML
    sanitize/prepare 두 단계가 BlockNote · Tiptap 마크업을 모두 통과시켜야 함
```

## 8. lazy 마이그레이션 흡수 지점

| 시나리오 | 흡수 위치 | 결과 |
|---|---|---|
| 신규 작성 | (없음) | Tiptap HTML로 깨끗하게 저장 |
| 기존 글 수정 진입 → 저장 | `setContent`에서 Tiptap이 BlockNote HTML 파싱 → `getHTML()`이 Tiptap HTML로 출력 | 다음 저장에 Tiptap HTML로 자동 정착 |
| 기존 글 detail (열람만) | `prepareBodyForRender + sanitize-html` | 두 마크업 모두 정상 렌더 |

DB 마이그레이션 스크립트는 작성하지 않는다.

## 9. 호환성 위험 지점

대부분의 표준 HTML 태그는 양쪽 모두 동일하다. 명시적 처리가 필요한 두 항목:

### 9.1 테이블 컬럼 너비

- BlockNote 출력: `<colgroup><col style="width:Npx">…</colgroup>`
- Tiptap 출력: `<td colwidth="N">` (속성)
- detail CSS(`[&_table]:table-fixed`)는 BlockNote의 colgroup 구조에 의존한다.

처리: `prepareBodyForRender`에서 **`td[colwidth]` 가 존재하는 테이블은 동일 행의 colwidth들을 모아 `colgroup>col[style="width:Npx"]`로 변환**한다. 첫 행 기준으로 colwidth를 수집하고, 빈 셀(colwidth 누락)은 0이 아닌 `auto`로 둔다. detail CSS는 손대지 않는다.

### 9.2 체크리스트

본 마이그레이션에서 비활성 결정. 기존 콘텐츠에 BlockNote 체크리스트가 포함되어 있으면 detail에서는 일반 리스트로 fallback 렌더된다(Tiptap에서도 입력은 그대로 통과되지만 편집 UI에서는 일반 리스트로 보인다).

`sanitize-html`에는 `<input type="checkbox">` 자체는 통과시켜 fallback 표시가 깨지지 않게 둔다.

## 10. sanitize-html 화이트리스트 확장 요지

```
태그: 기존 + <label>, <input type="checkbox">  (체크리스트 fallback 표시용)
속성: 기존 + data-type, data-checked, data-language, colwidth
       + <input>: type, checked, disabled (단, type="checkbox"만 통과시키고 그 외 input은 차단)
보존: colgroup, col[style="width:…"]
표 속성: <table style/class>, <td/th colspan/rowspan>
```

`<input type="checkbox">`는 BlockNote 시절 체크리스트가 저장된 기존 콘텐츠가 detail에서 깨지지 않도록 통과시킨다. 보안상 다른 type(예: `text`, `submit`)은 sanitize에서 제거한다.

기존 BlockNote 마크업 화이트리스트는 **그대로 유지**한다. 어느 한쪽도 끊기지 않게 양방향 통과를 보장한다.

## 11. UI 설계

### 11.1 컨테이너

```
<div className="… 외곽 박스(border/hover/focus-within 동일 유지)">
  <EditorToolbar editor={editor} />               ← 상단(border-b)
  <EditorContent editor={editor} className="…" /> ← 본문(min-h-[150px])
  <SlashMenuPopover editor={editor} />            ← tippy 종속
</div>
```

외곽 색상(`#EBEBEB → #D1D1D1 → #101010`)과 라운드(`6px`)는 현행과 동일.

### 11.2 Toolbar 그룹

| 그룹 | 항목 | 비고 |
|---|---|---|
| G1 블록 타입 | 段落 / H1 / H2 / H3 | **드롭다운**(현재 블록 타입을 라벨로 표기, 클릭 시 4개 옵션 노출) |
| G2 인라인 | 太字 · 斜体 · 取消線 · インラインコード | toggle, isActive 표시 |
| G3 리스트 | 箇条書き · 番号付き | toggle |
| G4 블록 | 引用 · コードブロック | toggle |
| G5 삽입 | 画像 · テーブル | 클릭 액션 |
| G6 히스토리 | 元に戻す · やり直し | undo/redo |

각 버튼: 36×36 IconButton, isActive 시 `bg-[#F4F4F4]`, `editable=false`면 disabled, aria-label·title 모두 일본어. 키보드 단축키는 StarterKit 기본 그대로.

BubbleMenu와 좌측 블록 핸들은 사용하지 않는다.

### 11.3 SlashMenu — `/`

`@tiptap/suggestion` + `tippy.js` 표준 패턴.

| 라벨 | 키워드 매칭 | 액션 |
|---|---|---|
| 段落 | paragraph, p, text | setNode paragraph |
| 見出し 1/2/3 | h1/h2/h3, heading | setNode heading |
| 箇条書きリスト | bullet, ul, list | toggleBulletList |
| 番号付きリスト | number, ol | toggleOrderedList |
| 引用 | quote, blockquote | toggleBlockquote |
| コードブロック | code, codeblock | toggleCodeBlock |
| 画像 | image, img | 파일 picker → 업로드 → setImage |
| テーブル | table | insertTable rows:3 cols:3 withHeaderRow:true |

검색: 일본어 라벨 부분 일치 + 영어 키워드 부분 일치. 매칭 0건이면 `該当する項目がありません` 표시 후 메뉴 유지.

키보드: `↑/↓` 이동, `Enter`/`Tab` 선택, `Esc` 닫기, `/` 자체 삭제 시 자동 닫기.

슬래시 트리거 hint(예: 우측 끝의 "/ で挿入" 안내)는 표시하지 않는다.

### 11.4 Placeholder

`@tiptap/extension-placeholder` 사용. 빈 첫 paragraph에만 표시. props로 받은 `placeholder`를 그대로 전달. aria-label은 외곽 컨테이너에 prop 그대로.

### 11.5 일본어 라벨 사전

`editor-i18n.ts`에 모든 라벨/메시지를 모은다. 변경/번역이 한 곳에서 일어나도록.

```ts
export const editorI18n = {
  toolbar: { paragraph: "段落", heading1: "見出し 1", /* … */ },
  slash:   { empty: "該当する項目がありません", items: { /* … */ } },
} as const;
```

### 11.6 디자인 토큰·폰트

- 보더/배경/그림자: 기존 globals.css 토큰 그대로
- 본문 폰트: **`Noto Sans JP`로 통일** (BlockNote가 강제 로드하던 Inter는 제거)
- 그림자는 부모 섹션이 갖고 있어 내부는 평면 유지

## 12. 인라인 이미지 업로드

### 12.1 진입로

세 경로 모두 단일 함수 `uploadInlineImage(file: File): Promise<string>`로 수렴.

- 툴바 G5 画像 버튼 → 숨겨진 `<input type="file" accept="image/*">`
- 슬래시 메뉴 画像 → 동일 file picker 재사용
- paste / drop → ProseMirror plugin (`inline-image-paste.ts`)

### 12.2 코어 함수 (현행 그대로 이식)

```ts
async function uploadInlineImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<{ data: { id: number; url: string } }>(
    "/inline-images",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.data.url;
}
```

API 시그니처/응답 스키마 변경 없음. 클라이언트 추가 검증은 두지 않고 서버 정책을 따른다.

### 12.3 paste/drop 처리

paste/drop 자동 업로드는 활성 유지(현행과 동일).

`inline-image-paste.ts`에서 ProseMirror plugin으로 `editorProps.handlePaste` / `handleDrop`를 가로챈다.

```
1. 이벤트에서 image/* File[] 추출
2. preventDefault — 브라우저 기본 동작 차단
3. Promise.allSettled(files.map(uploadInlineImage))
4. 성공한 url들을 editor.chain().insertContent([{type:'image', attrs:{src}}, ...]).run()
5. 실패는 각 에러를 onUploadErrorRef.current?.(error)로 호출
```

이 패턴은 임시 placeholder 노드 없이 **업로드 완료 후 1회만 onChange를 발생시킨다**. `inline-image-cleanup`이 임시 src를 잘못 수집할 위험이 0이다.

### 12.4 업로드 중 시각 피드백

외곽 컨테이너에 `data-uploading="true"` attribute를 토글하고, **상단 1px indeterminate progress bar**를 CSS로만 표시한다. React 상태는 `isUploading: boolean` 하나만 추가한다. 동시 업로드가 N건이면 모두 끝날 때까지 표시 유지.

업로드 실패는 `onUploadError` 흐름이 alert로 처리하므로, 중간 상태 텍스트나 임시 노드는 두지 않는다.

### 12.5 cleanup·기존 콘텐츠 호환

- `extract-inline-image-ids.ts`는 `<img src>`만 파싱 → 양쪽 마크업 동일하므로 영향 0.
- 기존 BlockNote 인라인 이미지는 Tiptap에서 그대로 표시된다.

### 12.6 onUploadError 메시지 정책 (현행 유지)

`contents-form.tsx:206` 흐름 그대로 — 서버가 일본어 메시지를 내려주면 그대로 alert, 아니면 `画像のアップロードに失敗しました。しばらくしてからお試しください。`로 일반화.

## 13. 에러 처리 매핑

| 발생 지점 | Tiptap 처리 | 부모 전파 |
|---|---|---|
| 마운트 `setContent` 실패 | try-catch로 감싸 빈 doc fallback | `onParseErrorRef.current?.(error)` |
| `prepareBodyForEditor` 내 throw | 동일 catch에 포함 | 동일 |
| `editor.getHTML()` 실패 | `useEditorChange` 내 try-catch (현 패턴) | console.error만 — listener loop 보호 |
| 인라인 이미지 업로드 실패 | `Promise.allSettled` rejected | 각 에러를 `onUploadErrorRef.current?.(error)` |
| 슬래시·툴바 명령 실패 | tiptap chain은 boolean 반환 | (없음) |

원칙(현행 그대로):

- 콜백은 `useRef` 캡처 → 부모 재렌더로 함수 ID가 바뀌어도 에디터·핸들러 재생성 없음
- 콜백 한 번 실패가 다음 이벤트를 침묵시키지 않도록 try-catch
- 콘솔 로그 prefix `[RichEditor]`

## 14. 검증 / 테스트 전략

### 14.1 단위 테스트 — 본 마이그레이션 범위 외 (결정 사항)

본 프로젝트에는 현재 vitest/jest 등 단위 테스트 인프라가 없다. **본 마이그레이션에서는 단위 테스트 인프라 도입을 후속 과제로 분리하고, 본 PR 범위에서는 제외한다.** 검증은 14.2 수동 회귀 체크리스트와 14.3 정적 검증으로 게이트한다.

추후 인프라가 도입되면 다음 5종을 회귀 테스트로 추가하는 것을 권장한다(별도 이슈로 추적):

1. `prepareBodyForRender` — `td[colwidth]` → `colgroup` 정규화 (양수/누락/소수/0/매우 큰 값/혼재)
2. `prepareBodyForRender` — BlockNote 마크업 회귀 (입출력 동등성)
3. `sanitize-html` — Tiptap data-* 통과 / 위험 속성 차단(특히 `<input type` 화이트리스트)
4. `is-html-empty` — Tiptap 빈 doc(`<p></p>`) 판정
5. `extract-inline-image-ids` — Tiptap 출력 HTML 회귀

ProseMirror 동작 자체는 단위 테스트 비용 대비 효용이 낮아 e2e 또는 수동에 맡긴다.

### 14.2 수동 회귀 체크리스트

| # | 시나리오 | 검증 |
|---|---|---|
| 1 | 신규 작성: 段落/H1~3/리스트/引用/코드/테이블/이미지 → 저장 → detail | 모든 블록 의도대로 렌더 |
| 2 | paste 이미지 1장 → 저장 → detail | 정상 표시, alert 0 |
| 3 | drop 이미지 3장 동시 → 저장 → detail | 3장 정상, 1px progress 노출/소멸 |
| 4 | drop 시 1장 실패 (큰 용량 강제) → 나머지 삽입 + alert 1회 | 부분 성공 OK |
| 5 | 기존 BlockNote 글 수정 진입 → 본문 그대로 표시 → 저장 → detail | lazy 마이그레이션 무손실 |
| 6 | BlockNote 글 → 테이블 너비 보존(수정·미수정 양쪽) | colgroup 정규화 OK |
| 7 | 빈 본문 → 저장 시도 | 기존 validation alert 그대로 |
| 8 | 손상 HTML 강제 주입 → 수정 진입 | onParseError alert 동작 |
| 9 | 권한 없는 사용자 직접 URL 진입 | 기존 차단 동작 그대로 |
| 10 | PC/모바일 detail | 모든 블록 정상 |

### 14.3 정적 검증

- `pnpm lint` — 경고 0 목표 (CLAUDE.md 규칙)
- `pnpm build` — 통과
- TypeScript strict, `any` 0
- React Compiler 린트 위반 0

## 15. 단계별 PR 분할

### PR-1 — 동작 무변경 리네임

- 디렉토리 rename: `block-editor/` → `rich-editor/` (components, lib 양쪽)
- 심볼: `BlockEditor*` → `RichEditor*`
- 임포트 사이트 4곳 갱신
- 동작·의존성 변경 0
- `pnpm lint` / `pnpm build` 통과

### PR-2 — BlockNote → Tiptap 본체 교체

- 의존성 swap (5절)
- `rich-editor.tsx` Tiptap 구현 (마운트/onChange 가드 패턴 유지)
- `editor-extensions.ts`, `editor-toolbar.tsx`, `editor-slash-menu.tsx`, `editor-i18n.ts`, `inline-image-paste.ts` 신규
- `prepareBodyForRender`에 `td[colwidth]` → `colgroup` 정규화 추가
- `sanitize-html` 화이트리스트 확장
- 수동 회귀 체크리스트 10/10 + 정적 검증 통과 후 머지

PR을 합쳐도 무방하나, 분리가 리뷰 효율과 회귀 격리에 유리하다.

## 16. 롤백 계획

| 시나리오 | 처리 |
|---|---|
| 머지 직후 critical 이슈 | `git revert <PR-2 merge>` 한 번 |
| DB 변경 | 없음 — 롤백 시 데이터 손실 0 |
| Tiptap 저장 후 롤백 → BlockNote가 표시 | 표준 HTML이라 BlockNote 자체 파서가 흡수. PR-2 머지 전 detail에서 Tiptap 본문이 정상 렌더되는지 명시 검증 |

## 17. 운영 모니터링 (머지 후 1주)

| 신호 | 확인처 |
|---|---|
| `[RichEditor] 초기 본문 파싱 실패` | 서버/클라 로그 — lazy 마이그레이션 회귀 1차 신호 |
| `[RichEditor] inline image upload failed` | 서버/클라 로그 + 사용자 문의 |
| `[RichEditor] onChange 처리 실패` | 클라 로그 — Tiptap 내부 변환 이슈 |
| 콘텐츠 detail 표시 이슈 | 사용자 문의 + QA 회귀 |

## 18. 머지 게이트 (성공 기준)

다음을 **모두 충족**해야 PR-2 머지 가능:

1. 수동 회귀 체크리스트 10/10
2. `pnpm lint` 경고 0
3. `pnpm build` 성공
4. TypeScript strict 통과 (`any` 0)
5. React Compiler 린트 위반 0
6. 기존 BlockNote 본문 1건 이상의 lazy 마이그레이션 실측 검증

## 19. 비목표 재확인

- 새 블록 추가, syntax highlight, 협업 기능, 드래그 핸들 — 모두 본 마이그레이션 범위 밖
- 다른 페이지에 에디터를 재사용하기 위한 추상화 — 두 번째 사용처가 실제로 필요해진 시점에 별도 PR로 분리
