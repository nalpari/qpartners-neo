# BlockNote Editor 도입 — 설계 문서

- **작성일**: 2026-04-28
- **대상 기능**: 콘텐츠 등록/수정 화면의 본문 입력 영역을 단순 textarea에서 BlockNote 기반 리치 에디터로 교체
- **적용 범위**: `src/app/contents/create`, `src/app/contents/[id]/edit` (그 외 `admin/notices`, `admin/bulk-mail` 등은 후속 작업)
- **상태**: 초안 (사용자 검토 필요)

---

## 1. 목표 및 비목표

### 목표

- 콘텐츠 작성자가 헤딩·리스트·표·인용·코드 블록 등 기본 구조화 요소를 사용해 본문을 작성할 수 있도록 한다.
- 기존에 `Content.body`(MediumText)에 저장된 plain text 데이터를 손상 없이 점진적으로 HTML로 전환한다.
- 상세 화면 렌더 코드 변경을 최소화하고, DB 스키마 / API 시그니처 / Zod 스키마는 변경하지 않는다.
- 일본어 UI에 맞춰 BlockNote 슬래시 메뉴·툴바·플레이스홀더를 `ja` 로케일로 표시한다.

### 비목표 (이번 스코프 제외)

- 본문 내 이미지 **업로드** — `uploadFile` 콜백을 미설정해 외부 URL 입력만 허용. 자체 스토리지/외부 서비스 연동은 별도 작업으로 분리.
- `admin/notices`, `admin/bulk-mail`, `home-notices` 등 다른 본문 입력 화면.
- 다크 모드 테마(라이트 고정).
- 협업 기능(real-time collaboration), AI 보조 기능, 코멘트.
- 자동 저장 / 변경 이력.
- 기존 plain text 데이터에 대한 **일괄 마이그레이션** — 읽기 시 lazy 변환으로 점진 처리.

---

## 2. 결정 요약

| 항목 | 결정 |
| --- | --- |
| 적용 범위 | `contents/create`, `contents/[id]/edit` 만 |
| 저장 포맷 | HTML (`Content.body MediumText` 그대로 활용) |
| 본문 이미지 업로드 | 미지원 (`uploadFile` 미설정 → 외부 URL만) |
| 기존 데이터 호환 | 읽기 시 lazy 변환 (단일 유틸 함수) |
| 허용 블록 | 헤딩 H1–H3 / 단락 / 불릿·번호·체크 리스트 / 인용 / 코드 / 표 / 이미지(URL) |
| UI 어댑터 | `@blocknote/mantine` (BlockNote 공식 권장) |
| 로케일 | `ja` |
| 테마 | 라이트 고정 |
| SSR | 비활성 — `next/dynamic(..., { ssr: false })` |

---

## 3. 아키텍처

### 3.1 의존성

신규 런타임 의존성:

```
@blocknote/core
@blocknote/react
@blocknote/mantine
@mantine/core
@mantine/hooks
@mantine/utils
```

기존 의존성 활용: `dompurify`, `isomorphic-dompurify` (sanitize에 그대로 사용).

### 3.2 아키텍처 결정

1. **Client-only 컴포넌트** — `BlockNoteView`는 contenteditable / Prosemirror에 의존해 SSR 불가. `next/dynamic(..., { ssr: false })`로 lazy-load.
2. **에디터 분리** — 현재 `contents-form-editor.tsx`는 "타이틀 + textarea" 두 책임이 묶여 있음. 본문만 다루는 신규 컴포넌트 `block-editor`를 `src/components/common/`에 두고, `contents-form-editor.tsx`는 본문 영역을 `BlockEditorLoader`로 교체. 다른 도메인(notices/bulk-mail) 확장 시 재사용 여지 확보.
3. **HTML 변환 책임 위치**
   - 편집 → 저장: 클라이언트(`editor.blocksToFullHTML`)에서 HTML로 변환해 폼 state 업데이트. submit 시 기존 API에 그대로 전송.
   - 저장 → 편집: 서버에서 받은 HTML을 `prepareBodyForEditor(body)` 유틸로 정규화(plain text → `<p>...</p>` 등) 후 `editor.tryParseHTMLToBlocks`로 초기 블록 생성.
4. **렌더(상세 페이지)** — 변경 폭 최소화. 기존 `DOMPurify` 파이프라인을 단일 유틸(`sanitizeContentHtml`)로 추출하고, BlockNote가 출력하는 태그·속성을 허용 목록에 포함시킨다.
5. **번들 영향 격리** — BlockNote + Mantine은 무겁기 때문에 `next/dynamic`으로 코드 스플릿. 콘텐츠 등록/수정 화면에서만 로드되어 다른 페이지 영향 없음.
6. **React Compiler 호환** — BlockNote는 자체 메모이제이션을 관리하며, wrapper 컴포넌트는 `useEffect` 안의 `setState`를 사용하지 않는 패턴이라 프로젝트 룰 `react-hooks/set-state-in-effect`와 충돌하지 않는다.
7. **React 19 호환성 검증** — 설치 직후 `pnpm install`의 peer 경고 0건, `pnpm dev`에서 `<BlockNoteView>` 마운트 시 콘솔 경고 0건을 확인. 충돌 시 패키지 버전 또는 `@blocknote/ariakit` 어댑터를 검토.

---

## 4. 컴포넌트 / 파일 구조

```
src/
├── components/
│   ├── common/
│   │   └── block-editor/
│   │       ├── block-editor.tsx          [신규] BlockNote wrapper (client-only)
│   │       ├── block-editor-loader.tsx   [신규] dynamic import + Skeleton
│   │       ├── block-editor-skeleton.tsx [신규] 로딩 폴백
│   │       ├── block-editor.types.ts     [신규] props 타입 / 허용 블록 타입
│   │       └── index.ts                   [신규] named export
│   └── contents/
│       ├── create/
│       │   └── contents-form-editor.tsx  [변경] textarea → <BlockEditorLoader/>
│       └── detail/
│           └── contents-detail-body.tsx  [변경] sanitize 호출을 sanitize-html로 위임
└── lib/
    └── block-editor/
        ├── prepare-body-for-editor.ts    [신규] 저장값 → 에디터 입력 정규화
        ├── allowed-blocks.ts              [신규] 허용 블록 스키마/슬래시 메뉴 필터
        └── sanitize-html.ts               [신규] DOMPurify 옵션 단일 정의 (공용)
```

### 4.1 파일별 책임

#### `block-editor.tsx`

- **타입**: client component (`"use client"`)
- **props**:
  ```ts
  interface BlockEditorProps {
    value: string;                       // 초기 HTML (uncontrolled init)
    onChange: (html: string) => void;    // 변경 시 풀 HTML 콜백
    placeholder?: string;
    editable?: boolean;                  // default true
    ariaLabel?: string;
  }
  ```
- **동작**:
  1. `useCreateBlockNote({ dictionary: locales.ja, schema: allowedBlocksSchema })`로 인스턴스 생성.
  2. 마운트 직후 `prepareBodyForEditor(value)` → `editor.tryParseHTMLToBlocks(html)` → `editor.replaceBlocks(editor.document, blocks)`.
  3. `useEditorChange(async (e) => { const html = await e.blocksToFullHTML(e.document); onChange(html); }, editor)`.
  4. 슬래시 메뉴 / 사이드 메뉴 / 포맷팅 툴바를 커스터마이즈해 비허용 블록 항목 숨김.
  5. `<BlockNoteView editor={editor} editable={editable} theme="light" />`.
- **value 의미**: 초기값으로만 사용. 외부에서 다른 HTML로 덮어써야 하는 경우(폼 reset 등)는 부모가 `key` prop을 변경해 리마운트한다. `useEffect` 안 setState 패턴 금지.

#### `block-editor-loader.tsx`

- `next/dynamic(() => import("./block-editor").then(m => m.BlockEditor), { ssr: false, loading: () => <BlockEditorSkeleton /> })`.
- 외부에는 동일 props 전달. 콘텐츠 폼은 항상 이 컴포넌트를 import.

#### `block-editor-skeleton.tsx`

- 폼의 본문 영역과 같은 높이의 회색 placeholder로 layout shift 최소화.

#### `block-editor.types.ts`

- `BlockEditorProps` 정의.
- 허용 블록 타입 enum / 상수 export.

#### `prepare-body-for-editor.ts`

- 입력: `body: string | null`.
- 동작:
  - `null` 또는 빈 문자열 → `""` 반환.
  - HTML 태그(`/<[a-z][^>]*>/i`)가 없으면 plain text로 간주: 줄바꿈 단위로 split → 빈 줄 제거 → 각 줄을 `<p>...</p>`로 감싼 HTML 반환.
  - HTML 태그가 있으면 그대로 반환.
- 책임 경계: 정규화만 담당. sanitize는 렌더 시점에 별도로 수행.

#### `allowed-blocks.ts`

- BlockNote `BlockNoteSchema.create({ blockSpecs: { ... } })`로 다음 블록만 등록:
  - `paragraph`, `heading`(levels 1–3), `bulletListItem`, `numberedListItem`, `checkListItem`, `quote`, `codeBlock`, `table`, `image`.
- 슬래시 메뉴 항목 / 사이드 메뉴 변환 옵션 / 포맷팅 툴바가 같은 목록을 참조하는 단일 source of truth.
- 비활성 블록: `video`, `audio`, `file`, `pageBreak` 등.

#### `sanitize-html.ts`

- `sanitizeContentHtml(html: string | null): string` export.
- DOMPurify 옵션:
  - `ALLOWED_TAGS`: `p, h1, h2, h3, ul, ol, li, blockquote, pre, code, table, thead, tbody, tr, th, td, img, a, strong, em, u, s, br, span, div`.
  - `ALLOWED_ATTR`: `class, href, src, alt, title, colspan, rowspan, target, rel`. `data-*` / `aria-*`는 prefix 허용 옵션 사용.
  - 인라인 `style` 불허.
  - `a[href]`: `https?:`, `mailto:`, 앵커(`#...`) 만 허용. `target="_blank"`이면 `rel="noopener noreferrer"` 강제 부여.
  - `img[src]`: `https?:` 또는 `data:image/(png|jpe?g|gif|webp);base64,` 만 허용. 그 외 src 제거.
- `null` 입력 → `""` 반환.

#### `contents-form-editor.tsx` (변경)

- 본문 영역의 `<textarea>`를 `<BlockEditorLoader value={content} onChange={onContentChange} ariaLabel="内容を入力" placeholder="内容を入力してください" />`로 교체.
- 외곽 `<section>` / 라벨(`内容 *`) 그대로 유지.
- 신규 props 추가 없음 (기존 `content`/`onContentChange` 유지).

#### `contents-detail-body.tsx` (변경)

- `DOMPurify.sanitize(body.replace(/\n/g, "<br>"))` 호출을 `sanitizeContentHtml(body)`로 교체.
- 레거시 plain text 호환을 위한 `\n → <br>` 전처리는 `sanitizeContentHtml` **이전 단계**로 유지(또는 동등 효과를 sanitize 유틸 안에서 처리하되 책임 경계 명확화).
  - **결정**: `\n → <br>` 전처리는 `sanitizeContentHtml` 외부에서 수행 (렌더 컴포넌트의 책임). sanitize 유틸은 입력 HTML을 검사·필터하는 일에만 집중.

### 4.2 영향 범위

- **변경 없음**:
  - `Content` Prisma 모델, 마이그레이션
  - `POST /api/contents`, `PATCH /api/contents/[id]`, `GET /api/contents/[id]`
  - `src/lib/schemas/`의 `content` Zod 스키마(여전히 `min(1)` HTML 문자열)
  - 첨부파일 컴포넌트(`contents-form-attachment.tsx`)
  - 권한·인증·미들웨어

---

## 5. 데이터 흐름

### 5.1 편집 → 저장 (Create / Edit 공통)

```
[contents-form.tsx]
   content: string (HTML)               ← 폼 state (기존 그대로)
        │
        ▼
[contents-form-editor.tsx]
   <BlockEditorLoader
      key={contentId ?? "new"}          ← 외부 reset 시 리마운트
      value={content}                   ← 초기값 (uncontrolled init)
      onChange={setContent} />
        │
        ▼ (next/dynamic, ssr:false)
[block-editor.tsx]
   1. useCreateBlockNote({ dictionary: locales.ja, schema: allowedBlocksSchema })
   2. mount: prepareBodyForEditor(value) → tryParseHTMLToBlocks → replaceBlocks
   3. useEditorChange(async e => onChange(await e.blocksToFullHTML(e.document)))
        │
        ▼ (submit)
[contents-form.tsx → axios POST/PATCH /api/contents]
   body: { title, content: <HTML>, ... } ← API 변경 없음
        │
        ▼
[Zod schema]    content: z.string().min(1, "内容は必須です")
        │
        ▼
[Prisma Content.body MediumText]
```

### 5.2 저장 → 편집 (Edit 진입)

```
[GET /api/contents/[id]]
   body: string (HTML | legacy plain text | null)
        │
        ▼
[edit page (RSC / TanStack Query)]
   초기 content state ← body ?? ""
        │
        ▼
[BlockEditor mount]
   prepareBodyForEditor(body):
     - "" 또는 null  → ""
     - HTML 태그 미포함  → 줄 단위 split → "<p>line1</p><p>line2</p>"
     - HTML 태그 포함    → 그대로
        │
        ▼
   tryParseHTMLToBlocks(normalized) → 블록 배열 → replaceBlocks
```

### 5.3 저장 → 렌더 (Detail)

```
[GET /api/contents/[id]] → body: string | null
        │
        ▼
[contents-detail-body.tsx]
   1. body가 null/빈 문자열이면 본문 영역 미렌더.
   2. legacyPreprocessed = body.replace(/\n/g, "<br>")
   3. safeHtml = sanitizeContentHtml(legacyPreprocessed)
   4. <div dangerouslySetInnerHTML={{ __html: safeHtml }} className="prose ..." />
```

### 5.4 핵심 사항

1. **API/Zod/Prisma 변경 없음** — 모든 변환은 클라이언트에서 발생.
2. **무한 루프 방지** — `value` prop은 마운트 시점의 초기값으로만 쓰이고 이후 BlockNote 내부 상태가 진실의 원천. 외부 reset이 필요한 경우만 `key` prop 변경으로 명시적 리마운트.
3. **빈 본문 검증의 함정** — BlockNote의 빈 문서는 `<p></p>`(또는 그에 준하는 HTML)을 출력하므로 Zod `min(1)`을 통과한다. 클라이언트에서 submit 직전에 `editor.document`가 비어 있는지(블록 0개 또는 모든 블록의 `content`가 빈지) 검사해 폼 에러 표시. 서버 검증은 `min(1)` 그대로 유지(이중 가드).
4. **레거시 plain text → HTML 자동 전환** — 기존 콘텐츠를 한 번 수정·저장하면 그 시점부터 HTML로 저장됨. 점진적 정규화.

---

## 6. 호환성·에러 처리

### 6.1 번들 영향

- `next/dynamic`으로 client-only 경계에 격리. 다른 페이지 번들 영향 없음.
- 검증: `pnpm build` 로그에서 콘텐츠 페이지 청크가 별도로 분리되는지 확인.

### 6.2 CSS 격리

- `@blocknote/mantine/style.css` + `@blocknote/core/fonts/inter.css`는 **에디터 컴포넌트 파일 내에서만 import**. 전역 `globals.css`에 넣지 않음.
- BlockNote 자체 클래스는 `.bn-` 접두사로 격리되어 충돌 위험 낮음.
- 다크 모드: 1차 도입에서는 라이트 테마 고정(`<BlockNoteView theme="light">`).

### 6.3 SSR / Hydration

- `next/dynamic(..., { ssr: false })`로 서버 렌더 우회. 로딩 폴백은 `BlockEditorSkeleton`으로 layout shift 최소화.
- 부모 페이지가 RSC여도 무관. 폼 자체가 이미 `"use client"` 컴포넌트 트리.

### 6.4 에러 처리

- `tryParseHTMLToBlocks`는 항상 결과를 반환하므로 throw 없음. 마운트 시점 한 번만 호출하고 결과를 캐시.
- `<BlockNoteView>` 컨테이너에서 키보드 Enter가 폼 submit으로 의도치 않게 전파되지 않도록 폼 element가 BlockNote 내부 Enter를 가로채지 않게 한다(BlockNote는 자체 Enter 처리: 새 단락 생성).
- 서버 측 에러 처리: 변경 없음. 기존 route handler의 최상위 try-catch 유지.

### 6.5 보안 — XSS

- 신뢰 경계: 작성자도 신뢰 대상이 아니므로 **렌더 시 반드시 sanitize**.
- DOMPurify 옵션은 `sanitize-html.ts`에 단일 정의. (4.1 참고)
- 빈/널 입력 가드: `sanitizeContentHtml(null) → ""`.

### 6.6 권한·인증

- 변경 없음. 콘텐츠 폼 진입은 기존 라우트 가드 / 세션 검증을 그대로 통과.

### 6.7 접근성

- BlockNote는 기본적으로 ARIA 속성을 설정한다. 추가 wrapper에는 라벨용 `aria-label="内容を入力"`만 부여.
- 키보드 전용 흐름(슬래시 메뉴, 표 셀 이동, 마크업 단축키)은 BlockNote 디폴트를 사용.

---

## 7. 테스트 전략

### 7.1 자동 (CI 게이트)

- `pnpm lint` 통과 (오류 0건, 가능하면 경고 0건).
- `pnpm tsc --noEmit` 또는 `pnpm build` 통과.
- `pnpm build`: BlockNote dynamic import가 client-only 청크로 split되는지 빌드 로그에서 확인.

### 7.2 수동 (브라우저, `pnpm dev`)

1. **신규 작성** — `/contents/create` 진입 → 슬래시 메뉴에서 헤딩 / 리스트 / 표 / 코드 / 인용 각 1회 추가 → 일본어 IME 입력(変換 확정 포함) → submit → 상세 화면에서 동일 구조 렌더 확인.
2. **허용 외 블록 차단** — 슬래시 메뉴에 비디오·오디오·파일·페이지 분할 항목이 **표시되지 않음** 확인.
3. **이미지 URL** — 외부 이미지 URL 삽입 → 렌더 정상. **업로드 탭 비표시** 확인(`uploadFile` 미설정).
4. **레거시 데이터 호환** — 기존 plain text 콘텐츠(`\n` 포함) 1건을 `/contents/[id]/edit`로 진입 → 줄바꿈이 단락으로 분리돼 보이는지 확인. 저장 시 HTML로 정상 저장.
5. **빈 본문 검증** — 본문 비운 채 submit → 폼 에러 표시(클라이언트). 서버 `min(1)` 가드도 통과되지 않음을 직접 API 호출로 확인.
6. **XSS** — 본문에 `<script>alert(1)</script>` 가 포함된 HTML을 직접 API로 PATCH 후 상세 페이지 진입 → 스크립트 실행되지 않고 sanitize 확인.
7. **번들 / 첫 로드** — `/contents/create` 첫 진입 시 Network 탭에서 BlockNote 청크가 별도 로드되는지, 다른 페이지 진입 시에는 로드되지 않는지 확인.
8. **React Compiler / Hooks 룰** — `pnpm dev` 콘솔 경고 0건. set-state-in-effect 등 룰 위반 0건.
9. **브라우저 호환** — Chrome / Edge / Safari 최신 1버전에서 슬래시 메뉴·드래그·표 편집 정상.

### 7.3 유틸 단위 검증

테스트 인프라(Jest/Vitest)는 이번 도입에서 신설하지 않는다. 대신 다음 케이스를 수동으로 또는 추후 vitest 도입 시 자연스럽게 이전될 형태로 명문화한다.

**`prepareBodyForEditor`**

| 입력 | 기대 출력 |
| --- | --- |
| `null` | `""` |
| `""` | `""` |
| `"hello"` | `"<p>hello</p>"` |
| `"line1\nline2"` | `"<p>line1</p><p>line2</p>"` |
| `"line1\n\nline2"` | `"<p>line1</p><p>line2</p>"` (연속 개행의 빈 단락 제거) |
| `"<p>already html</p>"` | `"<p>already html</p>"` |
| `"<script>x</script>"` | `"<script>x</script>"` (sanitize는 렌더 시점 책임) |

**`sanitizeContentHtml`**

| 입력 | 기대 동작 |
| --- | --- |
| `null` | `""` |
| `<p>안녕</p>` | 그대로 |
| `<script>alert(1)</script>` | 제거 |
| `<a href="javascript:alert(1)">x</a>` | href 제거된 `<a>x</a>` |
| `<a href="https://ok" target="_blank">x</a>` | `rel="noopener noreferrer"` 부여 |
| `<img src="https://ok.png">` | 그대로 |
| `<img src="javascript:alert(1)">` | src 제거 |
| BlockNote 표 구조 (`<table><thead>...<tbody>...`) | 보존 |
| 인라인 style 속성 | 제거 |

---

## 8. 구현 순서 개략

세부 단계는 별도 implementation plan 문서에서 정의한다. 큰 흐름은 다음과 같다.

1. 의존성 설치 + 타입 체크.
2. 유틸 작성: `prepareBodyForEditor`, `sanitizeContentHtml`, `allowedBlocksSchema`.
3. `block-editor` 컴포넌트군 작성 (`block-editor.tsx`, `block-editor-loader.tsx`, `block-editor-skeleton.tsx`).
4. `contents-form-editor.tsx`에서 `<textarea>`를 `<BlockEditorLoader/>`로 교체.
5. `contents-detail-body.tsx`에서 `sanitize-html.ts` 사용하도록 변경.
6. 빈 본문 검증을 폼 submit 단계에 추가.
7. lint / 타입 / build 체크. 수동 시나리오 검증.
8. 문서(README, 필요 시 `docs/coding-conventions.md`) 업데이트.

---

## 9. 후속 작업 (이번 스코프 외)

- **본문 이미지 업로드** — 외부 시스템(예: 오브젝트 스토리지) 연동 후 `uploadFile` 콜백 구현 + 본문 이미지 src 화이트리스트 확장.
- **다른 도메인 적용** — `admin/notices`(HomeNotice), `admin/bulk-mail`(MassMail) 본문에 `BlockEditorLoader` 도입 검토. bulk-mail은 메일 호환 HTML 제약이 별도라 별도 sanitize 정책 필요.
- **다크 모드** — `prefers-color-scheme` 기반 BlockNote 테마 토글.
- **레거시 데이터 일괄 마이그레이션** — Prisma migration + 데이터 변환 스크립트로 한 번에 정규화 (현재는 lazy 변환).
- **테스트 인프라** — vitest 도입 시 7.3절의 케이스를 단위 테스트로 이전.
