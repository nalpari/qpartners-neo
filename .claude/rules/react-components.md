---
globs:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
---
### React Compiler 규칙

이 프로젝트는 `next.config.ts`에서 `reactCompiler: true`로 React Compiler를 활성화하고 있다.
`eslint-plugin-react-hooks` v7.0.0 이상에서 추가된 React Compiler 전용 린트 규칙을 반드시 준수해야 한다.

**`react-hooks/set-state-in-effect` — useEffect 안에서 setState 호출 금지**
- React Compiler의 자동 메모이제이션과 충돌하여 의도치 않은 동작 발생 가능
- `eslint-disable`로 무시하지 말 것
- 대안:
  - 읽기 전용 데이터: state 대신 파생 값으로 직접 계산 (`const value = queryData ?? default`)
  - 폼 편집 등 로컬 state 필요 시: 부모에서 `key` prop으로 리마운트 제어

**`react-hooks/set-state-in-render` — 렌더링 중 setState 호출 금지**

**기타 Compiler 규칙**: `purity`, `immutability`, `refs`, `globals`, `use-memo`, `static-components` 등
- `pnpm lint`로 검출되며, `eslint-disable` 처리 대신 규칙에 맞게 코드를 수정할 것

### 컴포넌트 작성
- 기본적으로 모든 컴포넌트는 Server Component
- `"use client"` 경계를 최대한 아래(leaf)로 내려서 서버 컴포넌트 영역 유지
- 페이지/레이아웃: `export default function` 사용
- 재사용 컴포넌트: named export 사용
