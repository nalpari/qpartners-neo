---
globs:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "prisma/**"
---
### 코딩 컨벤션

코드 작성 시 반드시 `docs/coding-conventions.md` 문서를 참조하여 다음 규칙을 준수할 것:

- TypeScript strict mode, `any` 금지 (`unknown` + 타입 가드 사용)
- `import type` 구문으로 타입 임포트
- 파일/폴더 네이밍: kebab-case (컴포넌트, 유틸, 스토어 등)
- `@/` 경로 별칭 사용 (상대 경로 `../` 금지)
- Import 순서: 외부 라이브러리 → 내부 모듈 → 상대 경로
- **React 19.2** 버전을 사용해야 한다. 의존성 추가 및 코드 작성 시 React 19.2 호환성을 반드시 확인할 것.