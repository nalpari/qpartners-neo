# DOMPurify SSR XSS 수정 가이드

> **PR**: #23 feat: 컨텐츠 상세 조회 API 연동 및 프론트엔드 품질 개선
> **대상 파일**: `src/components/contents/detail/contents-detail-body.tsx`
> **심각도**: WARNING (SSR 시 미살균 HTML 렌더링)

---

## 현재 문제

`contents-detail-body.tsx`에서 `typeof window` 가드로 DOMPurify SSR 크래시를 회피했지만,
서버 사이드에서는 `body`가 살균 없이 `dangerouslySetInnerHTML`에 삽입됨:

```typescript
// 현재 코드 (L67-73)
// typeof window 분기로 클라이언트에서만 DOMPurify.sanitize 적용
// 서버 사이드에서는 살균 없이 body가 그대로 렌더링됨
```

- `"use client"` 컴포넌트도 Next.js App Router에서 SSR pre-render를 거침
- `body`에 악성 태그가 있으면 SSR HTML 응답에 미살균 상태로 포함될 수 있음

---

## 수정 방법

### Step 1: 패키지 교체

```bash
pnpm remove dompurify
pnpm add isomorphic-dompurify
```

> `isomorphic-dompurify`는 내부적으로 `jsdom`을 사용하여 Node.js에서도 DOMPurify가 정상 동작함.
> `@types/dompurify`는 `isomorphic-dompurify`에 포함되어 있으므로 별도 설치 불필요.

### Step 2: import 변경

```diff
- import DOMPurify from "dompurify";
+ import DOMPurify from "isomorphic-dompurify";
```

### Step 3: typeof window 분기 제거

서버/클라이언트 모두 DOMPurify.sanitize()를 적용하도록 단순화:

```typescript
// 수정 후: isomorphic-dompurify로 서버/클라이언트 모두 안전하게 살균
<div
  className="font-['Noto_Sans_JP'] text-[14px] leading-[1.7] text-[#505050] prose prose-sm max-w-none"
  dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(body.replace(/\n/g, "<br>")),
  }}
/>
```

### Step 4: 검증

```bash
pnpm lint
npx tsc --noEmit
pnpm build
```

---

## 수정 전/후 비교

| | SSR (서버) | CSR (클라이언트) |
|---|---|---|
| **현재** (`dompurify` + `typeof window`) | 미살균 HTML 렌더링 | DOMPurify 살균 |
| **수정 후** (`isomorphic-dompurify`) | DOMPurify 살균 | DOMPurify 살균 |

---

## Montreal 재검토 수정사항 전체 현황

| 항목 | 상태 | 커밋 |
|------|------|------|
| MF-1: N+1 alert 폭탄 + unhandled rejection | ✅ 수정 완료 | `631808d` |
| MF-2: plain text 줄바꿈 소실 | ✅ 수정 완료 | `631808d` |
| MF-2: SSR hydration mismatch | ✅ 수정 완료 | `631808d` |
| MF-2: SSR XSS 방어 | ⚠️ **이 문서로 수정 필요** | — |
| WARNING: form-attachment 에러 alert | ✅ 수정 완료 | `631808d` |
| WARNING: initialFileIds useState 패턴 | ✅ 수정 완료 | `631808d` |
