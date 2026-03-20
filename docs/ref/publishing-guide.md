# 퍼블리싱 가이드

QPartners Neo 프로젝트의 마크업 퍼블리싱 규칙을 정의합니다.
코딩 컨벤션(`docs/coding-conventions.md`)과 `CLAUDE.md`에 정의된 내용은 이 문서에서 다루지 않습니다.

## 1. Figma 기반 디자인 원칙 (필수)

> **이 프로젝트의 모든 마크업은 Figma 디자인을 기준으로 작업합니다.**
> **AI가 임의로 디자인을 판단하거나 창작하지 않습니다.**

### 작업 흐름

1. 사용자가 **Figma MCP 링크**를 제공한다
2. MCP를 통해 Figma 파일의 디자인 정보(노드, 스타일, 레이아웃, 색상, 간격 등)를 조회한다
3. 조회한 디자인 정보를 **그대로** 코드로 변환한다

### 준수 규칙

| 항목 | 규칙 |
|------|------|
| 색상 | Figma에 정의된 색상값을 그대로 사용. 임의로 색상을 변경하거나 추측하지 않는다 |
| 간격/크기 | Figma의 padding, margin, gap, width, height 값을 그대로 반영한다 |
| 타이포그래피 | Figma에 정의된 font-size, font-weight, line-height를 그대로 적용한다 |
| 레이아웃 | Figma의 Auto Layout(flex 방향, 정렬, gap)을 Tailwind flex/grid로 변환한다 |
| 모서리/그림자 | Figma의 border-radius, box-shadow 값을 그대로 적용한다 |
| 아이콘/이미지 | Figma에 사용된 아이콘을 동일하게 매칭한다 (SVG Export 후 사용) |

### 금지 사항

- Figma에 없는 요소를 임의로 추가하지 않는다
- Figma 디자인과 다른 색상, 간격, 크기를 적용하지 않는다
- "이게 더 보기 좋을 것 같다"는 이유로 디자인을 수정하지 않는다
- Figma 링크 없이 마크업 작업을 시작하지 않는다 (사용자에게 먼저 요청)

### Figma MCP 링크가 없는 경우

사용자에게 Figma MCP 링크를 요청한다. 링크 없이는 마크업 작업을 진행하지 않고, 아래와 같이 안내한다:

```
"마크업 작업을 진행하려면 Figma MCP 링크를 제공해주세요.
디자인 없이 임의로 마크업을 작성하지 않습니다."
```

## 2. 시멘틱 HTML

용도에 맞는 HTML 태그를 사용합니다. 의미 없는 `<div>` 남용을 지양합니다.

| 용도 | 태그 | 잘못된 사용 |
|------|------|------------|
| 페이지 헤더 | `<header>` | `<div className="header">` |
| 내비게이션 | `<nav>` | `<div className="nav">` |
| 주요 콘텐츠 | `<main>` | `<div className="main">` |
| 독립 콘텐츠 블록 | `<section>` | `<div className="section">` |
| 목록 | `<ul>`, `<ol>` | `<div>` 반복 |
| 버튼/액션 | `<button>` | `<div onClick={...}>` |
| 페이지 이동 | `<Link>` (next/link) | `<a>`, `<div onClick={router.push}>` |
| 폼 입력 | `<input>`, `<select>`, `<textarea>` | 커스텀 div |
| 표 형태 데이터 | `<table>` | `<div>` 그리드로 모방 |

## 3. 반응형 디자인

모바일 퍼스트 방식으로 작성하며, **1024px** 단일 브레이크포인트를 사용합니다.

| 접두사 | 너비 | 대상 |
|--------|------|------|
| (없음) | < 1024px | 모바일 |
| `lg:` | >= 1024px | PC |

```tsx
// 모바일: 1열 → PC: 3열
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

// 모바일: 숨김 → PC: 표시
<nav className="hidden lg:flex">

// 모바일: 세로 쌓기 → PC: 가로 배치
<div className="flex flex-col lg:flex-row gap-4">
```

`sm:`, `md:`, `xl:`, `2xl:` 접두사는 사용하지 않습니다.

### Tailwind로 처리할 수 없는 스타일

Tailwind 유틸리티로 표현이 불가능한 스타일은 해당 요소에 의미 있는 클래스명을 부여하고, `src/style/contents/` 하위 SCSS 파일에 스타일을 작성합니다.

```tsx
// 컴포넌트에서 클래스명 부여
<div className="custom-gradient-overlay flex items-center">
```

```scss
// src/style/contents/_contents.scss
.custom-gradient-overlay {
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, transparent 60%);
}
```

**규칙:**
- 클래스명은 kebab-case로 작성한다 (e.g. `card-shimmer`, `text-ellipsis-2line`)
- Tailwind 클래스와 커스텀 클래스를 함께 사용할 수 있다
- 인라인 스타일(`style={}`)은 사용하지 않는다 — 반드시 클래스로 분리한다

### SCSS 파일 분리 규칙

커스텀 스타일은 용도에 따라 파일을 분리하여 관리합니다.

| 파일 | 용도 |
|------|------|
| `_contents.scss` | 페이지 콘텐츠 영역의 커스텀 스타일 (레이아웃, 외부 라이브러리 오버라이드 등) |
| `_pop-contents.scss` | 팝업/모달 관련 커스텀 스타일 (오버레이, 팝업 컨테이너, 팝업 내부 요소) |

```
src/style/contents/
├── _index.scss              # @forward "contents"; @forward "pop-contents";
├── _contents.scss           # 페이지 콘텐츠 스타일
└── _pop-contents.scss       # 팝업/모달 스타일
```

**규칙:**
- 새로운 SCSS 파일 추가 시 `_index.scss`에 `@forward` 추가 필수
- 팝업/모달 관련 스타일은 `_contents.scss`가 아닌 `_pop-contents.scss`에 작성한다
- 파일명은 `_용도-contents.scss` 형식을 따른다

## 4. 공통 컴포넌트 우선 사용 (필수)

`src/components/common/`에 정의된 공통 컴포넌트를 **반드시 우선 사용**한다. raw HTML 요소로 직접 구현하기 전에 대체 가능한 공통 컴포넌트가 있는지 먼저 확인한다.

### 사용 가능한 공통 컴포넌트

| 컴포넌트 | 용도 | raw HTML 대신 사용 |
|----------|------|-------------------|
| `Button` | 모든 버튼 액션 | `<button className="...">` |
| `InputBox` | 텍스트/이메일/비밀번호 등 단일 입력 | `<input className="...">` |
| `Checkbox` | 체크박스 | `<input type="checkbox">` |
| `Radio` | 라디오 버튼 | `<input type="radio">` |
| `SelectBox` | 셀렉트 드롭다운 | `<select>` |
| `Toggle` | 토글 스위치 | 커스텀 토글 |
| `DatePicker` | 날짜 선택 | 커스텀 날짜 입력 |

### 규칙

- 새로운 UI 요소를 구현하기 전에 `src/components/common/index.ts`의 export 목록을 확인한다
- 공통 컴포넌트로 대체 가능한 경우 반드시 사용하고, raw HTML로 직접 구현하지 않는다
- 공통 컴포넌트가 지원하지 않는 기능(예: 비밀번호 눈 토글)이 필요한 경우에만 raw HTML을 사용한다
- 스타일 미세 조정이 필요하면 `className` prop으로 오버라이드한다

### 금지 사항

- 공통 컴포넌트가 존재하는데 동일 역할의 raw HTML을 작성하지 않는다
- 공통 컴포넌트의 스타일을 무시하고 새로운 스타일로 재구현하지 않는다

## 5. 레이아웃

### 5.1 중첩 Layout

특정 라우트 그룹에만 적용되는 공통 요소(예: Sidebar)는 해당 경로의 `layout.tsx`에 배치합니다.

```tsx
// src/app/(main)/layout.tsx
import { Sidebar } from "@/components/layout/sidebar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <Sidebar className="hidden lg:block w-64 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

### 5.2 페이지 기본 구조

```tsx
export default function DashboardPage() {
  return <DashboardContents/>
}
```

### 5.3 카드 패턴

```tsx
<article className="flex flex-col gap-4 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
  <h3 className="text-lg font-semibold text-foreground">제목</h3>
  <p className="text-sm text-gray-600">내용</p>
</article>
```

### 5.4 리스트 패턴

```tsx
<ul className="divide-y divide-gray-200">
  {items.map((item) => (
    <li key={item.id} className="flex items-center gap-4 py-4">
      {/* 아이템 내용 */}
    </li>
  ))}
</ul>
```

## 6. 접근성 (a11y)

### 필수 규칙

- 이미지: `alt` 속성 필수 (장식 이미지는 `alt=""`)
- 인터랙티브 요소: 키보드 접근 가능해야 함 (`<button>`, `<a>` 우선 사용)
- 폼 요소: `<label>` 연결 또는 `aria-label` 제공
- 색상만으로 정보를 전달하지 않음 (아이콘, 텍스트 병행)

```tsx
// Good
<button aria-label="메뉴 닫기" onClick={onClose}>
  <XIcon className="size-5" />
</button>

// Bad
<div onClick={onClose}>
  <XIcon className="size-5" />
</div>
```

### 제목 계층

페이지 당 `<h1>` 하나, 계층 건너뛰지 않기 (h1 → h2 → h3).

## 7. 이미지 및 아이콘

### 이미지 에셋

| 포맷 | 저장 위치 | 처리 방식 |
|------|----------|----------|
| SVG | `public/asset/images/` 또는 컴포넌트 인라인 | AI가 코드로 직접 작성 가능 |
| PNG, JPG, WebP | `public/asset/images/` | 사용자가 직접 저장. AI는 필요 시 사용자에게 요청 후 진행 |

```tsx
import Image from "next/image";

<Image src="/asset/images/logo.png" alt="로고" width={120} height={40} />
```

- PNG 등 래스터 이미지가 필요한 경우 사용자에게 파일을 요청한 뒤 작업을 진행한다
- 이미지 파일 없이 임의의 placeholder를 사용하지 않는다
- 이미지 파일명은 하이픈(`-`)이 아닌 **언더스코어(`_`)**를 구분자로 사용한다 (e.g. `logo_hanwha.svg`, `icon_search.svg`)

### 아이콘

외부 아이콘 라이브러리(lucide-react 등)를 사용하지 않습니다. Figma에 등록된 아이콘을 SVG로 Export하여 `public/asset/images/`에 저장 후 사용합니다.

```tsx
import Image from "next/image";

<Image src="/asset/images/icon-search.svg" alt="검색" width={20} height={20} />
```

- 아이콘이 필요한 경우 Figma에서 해당 아이콘을 확인한다
- Figma에 없는 아이콘을 임의로 추가하지 않는다

## 8. 간격 및 크기 토큰

일관된 간격을 위해 Tailwind 기본 spacing 스케일을 사용합니다.

| 용도 | 권장 값 |
|------|---------|
| 요소 내부 패딩 (작은) | `p-2`, `p-3` |
| 요소 내부 패딩 (보통) | `p-4`, `p-6` |
| 섹션 간 간격 | `gap-6`, `gap-8` |
| 페이지 좌우 여백 | `px-4 lg:px-16` |
| 페이지 상하 여백 | `py-8 lg:py-12` |
| 컴포넌트 모서리 | `rounded-lg` (8px), `rounded-xl` (12px) |

## 9. 체크리스트

마크업 작업 완료 시 확인할 항목:

- [ ] Figma 디자인과 1:1로 일치하는가
- [ ] 시멘틱 태그를 적절히 사용했는가
- [ ] 반응형 대응이 되었는가 (모바일 ↔ PC, `lg:` 브레이크포인트)
- [ ] 접근성 속성이 포함되었는가 (alt, aria-label 등)
- [ ] 불필요한 `<div>` wrapper가 없는가
- [ ] `pnpm lint` 통과하는가

## 10. PDCA 문서 경로

`/pdca` 실행 시 생성되는 구현 전단계 `.md` 파일들(Plan, Design 등)은 `docs/ref/` 내부에 생성한다.

```
docs/ref/
  01-plan/features/{feature}.plan.md
  02-design/features/{feature}.design.md
  03-analysis/{feature}.analysis.md
  04-report/{feature}.report.md
```

## 11. View Transition (페이지 전환 애니메이션) (필수)

Next.js 16.2+ 의 `viewTransition` 실험적 기능을 활용하여 **모든 내부 페이지 전환에 fade in/out 애니메이션을 적용**합니다.

### 설정

`next.config.ts`에 `experimental.viewTransition: true`가 활성화되어 있어야 합니다.

### 사용법

**1. `<Link>` 컴포넌트에 `transitionTypes` 지정**

```tsx
import Link from "next/link";

<Link href="/signup" transitionTypes={["fade"]}>
  会員登録
</Link>
```

**2. `useRouter()`에서 사용**

```tsx
const router = useRouter();
router.push("/signup", { transitionTypes: ["fade"] });
```

**3. 레이아웃에 `<ViewTransition>` 래핑**

전환 효과를 적용할 라우트 그룹의 `layout.tsx`에 `<ViewTransition>`으로 children을 감쌉니다.

```tsx
import { ViewTransition } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <ViewTransition>{children}</ViewTransition>;
}
```

**4. CSS 애니메이션 정의**

`src/style/contents/_contents.scss`에 fade 애니메이션이 정의되어 있습니다.

```scss
::view-transition-old(fade) {
  animation: fade-out 0.2s ease-in-out;
}
::view-transition-new(fade) {
  animation: fade-in 0.2s ease-in-out;
}
```

### 규칙

- **모든 내부 `<Link>`에 `transitionTypes={["fade"]}`를 필수 적용**한다
- **`router.push()` / `router.replace()` 호출 시에도 `{ transitionTypes: ["fade"] }`를 필수 적용**한다
- 전환 효과가 적용되는 라우트 그룹의 `layout.tsx`에 `<ViewTransition>` 래핑이 필요하다
- 외부 링크(`target="_blank"`)에는 적용하지 않는다
- 새로운 전환 타입 추가 시 `_contents.scss`에 대응하는 CSS 애니메이션을 함께 정의한다

## 12. PDCA Plan 단계 기획서 참조 (필수)

`/pdca plan` 실행 시 **반드시** `docs/ref/` 폴더 안의 `.png` 파일을 확인한 후 진행한다.
기획서 이미지에는 기능 번호별 상세 스펙, 회원 유형별 입력 항목 차별화 등 Figma 디자인만으로는 파악할 수 없는 비즈니스 로직이 포함되어 있다.

### 절차

1. `docs/ref/` 폴더 내 `.png` 파일 존재 여부 확인
2. 존재하면 이미지를 읽어 기능 스펙 파악
3. Figma 디자인 + 기획서 이미지를 종합하여 Plan 문서 작성

### 금지 사항

- 기획서 이미지를 확인하지 않고 Plan을 작성하지 않는다
- Figma 디자인만으로 기능 사양을 추측하지 않는다 (기획서에 명시된 Read Only, Alert 문구, 유형별 분기 등을 반드시 반영)
