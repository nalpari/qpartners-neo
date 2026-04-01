---
globs:
  - "src/app/api/**/*.ts"
  - "src/lib/schemas/**"
---
### API 개발 규칙

#### 새 기능 추가 순서
1. `prisma/schema.prisma`에 모델 정의 → `pnpm prisma migrate dev --name <name>`
2. `src/lib/schemas/`에 Zod 스키마 작성
3. `src/app/api/`에 Route Handler 추가
4. 페이지 컴포넌트 생성 (`src/app/` 하위)

#### Zod 검증
- `src/lib/schemas/`에 입력 검증 스키마 정의
- Route Handler에서 `safeParse`로 검증

#### HTTP Client
- `src/lib/axios.ts` — `baseURL: "/api"` 설정된 공용 인스턴스
- 클라이언트 컴포넌트에서 API 호출 시 사용
