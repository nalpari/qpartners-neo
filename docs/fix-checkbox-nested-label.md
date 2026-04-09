# Checkbox 중첩 label 버그 수정

> **대상 파일**: `src/components/login/login-form.tsx`
> **심각도**: BUG (체크박스 클릭 시 상태가 변경되지 않는 현상)
> **증상 발생 환경**: 개발 서버 배포 환경 (프로덕션 빌드)

---

## 증상

로그인 페이지(`/login`)의 **이용약관 동의 체크박스**를 클릭해도 체크가 되지 않음.

- 로컬 개발 서버(`pnpm dev`)에서는 간헐적으로 발생
- 개발 서버 배포 환경(프로덕션 빌드, React Compiler 활성화)에서 재현율 높음

---

## 원인

### 중첩된 `<label>` 구조 (Invalid HTML)

`login-form.tsx`에서 `agreeTerms` 체크박스를 렌더링할 때, 외부 `<label>`로 감싸고 있었음.

```tsx
// ❌ 수정 전 — login-form.tsx
<label className="flex items-center gap-2 cursor-pointer">
  <Checkbox checked={agreeTerms} onChange={onAgreeTermsChange} />
  <span>利用規約に同意する必要があります</span>
</label>
```

그런데 `Checkbox` 컴포넌트 내부에도 이미 `<label>`이 존재함:

```tsx
// checkbox.tsx — 컴포넌트 내부
<label className="inline-flex items-center ...">
  <input type="checkbox" className="sr-only peer" ... />
  <span><!-- SVG 체크박스 --></span>
</label>
```

이로 인해 실제 DOM 구조는 다음과 같이 **중첩 label**이 됨:

```html
<!-- ❌ 잘못된 DOM 구조 -->
<label>                              ← 외부 label
  <label>                            ← 내부 label (Checkbox 컴포넌트)
    <input type="checkbox" />
    <span><!-- SVG --></span>
  </label>
  <span>利用規約...</span>
</label>
```

중첩 `<label>`은 **HTML 스펙 위반**이며, SVG 체크박스 영역 클릭 시 이벤트가 두 번 발생함:

| 단계 | 이벤트 흐름 | 결과 |
|------|------------|------|
| 1 | 클릭 → 내부 `<label>` | `<input>` 토글 (`false → true`), `onChange(true)` 호출 |
| 2 | 이벤트 버블링 → 외부 `<label>` | `<input>` 재토글 (`true → false`), `onChange(false)` 호출 |
| **최종** | — | 상태가 원래대로 돌아와 체크 불가 |

### 왜 배포 서버에서 더 두드러지나?

React Compiler(프로덕션 빌드)가 활성화된 환경에서 이벤트 처리 최적화가 적용되어, 이 이중 토글 패턴이 더 명확하게 드러남. 로컬 개발 모드(`NODE_ENV=development`)에서는 React의 추가 처리로 인해 증상이 가려질 수 있음.

---

## 수정 내용

외부 `<label>`을 **`<div>`로 교체**하여 중첩 label 구조를 제거.

```tsx
// ✅ 수정 후 — login-form.tsx
<div className="flex items-center gap-2">
  <Checkbox checked={agreeTerms} onChange={onAgreeTermsChange} />
  <span>利用規約に同意する必要があります</span>
</div>
```

### 수정 전/후 비교

| | 수정 전 | 수정 후 |
|--|---------|---------|
| **구조** | `<label>` > `<label>` > `<input>` (중첩, HTML 스펙 위반) | `<div>` > `<label>` > `<input>` (정상) |
| **클릭 이벤트** | 이중 발생 → 이중 토글 | 정상 1회 |
| **체크박스 동작** | 체크 불가 | 정상 동작 |

---

## 영향 범위

- **수정 파일**: `src/components/login/login-form.tsx`
- **영향 컴포넌트**: 로그인 페이지 이용약관 동의 체크박스
- **비영향 컴포넌트**: `saveId` 체크박스는 `Checkbox`의 `label` prop을 사용하여 중첩 없음

---

## 재발 방지

`Checkbox` 컴포넌트는 내부에 이미 `<label>`을 포함하므로, 외부에서 추가로 `<label>`로 감싸지 않아야 함.

```tsx
// ❌ 잘못된 사용 — 중첩 label 발생
<label>
  <Checkbox ... />
  <span>텍스트</span>
</label>

// ✅ 올바른 사용 1 — label prop 활용
<Checkbox label="텍스트" ... />

// ✅ 올바른 사용 2 — div로 감싸기
<div className="flex items-center gap-2">
  <Checkbox ... />
  <span>텍스트</span>
</div>
```
