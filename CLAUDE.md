# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — Start dev server (http://localhost:3000)
- `pnpm build` — Production build
- `pnpm lint` — Run ESLint (flat config, eslint v9)
- `pnpm prisma generate` — Regenerate Prisma client (after schema changes)
- `pnpm prisma migrate dev --name <name>` — Create and apply migration
- `docker compose up -d db` — Start MariaDB only (for local dev)
- `docker compose up -d --build` — Start full stack (app + db) in Docker

## Architecture

- **Framework**: Next.js 16, App Router (`src/app/`), React 19, React Compiler enabled
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`; theme tokens in `src/app/globals.css` using `@theme inline`
- **Path alias**: `@/*` maps to `./src/*`

### Data Layer

- **Database**: MariaDB 11 (Docker), accessed via Prisma 7 with `@prisma/adapter-mariadb`
- **Schema**: `prisma/schema.prisma` — Prisma CLI uses `DATABASE_URL` from `.env` via `prisma.config.ts`
- **Client**: `src/lib/prisma.ts` — Singleton PrismaClient with MariaDB adapter, uses `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` env vars at runtime
- **Generated code**: `src/generated/prisma/` (gitignored) — import from `@/generated/prisma/client`

### State Management

- **Server data**: Prefer Server Component direct DB queries for read-only data; use TanStack Query + Route Handlers (`/api/*`) for client-side interactivity
- **Client state**: Zustand stores in `src/lib/store.ts`
- **Query provider**: `src/lib/query-provider.tsx` wraps app in `layout.tsx` (staleTime: 60s default)

### Docker

- Multi-stage Dockerfile (`deps` → `builder` → `runner`) with `output: "standalone"`
- `docker-compose.yml`: `app` (Next.js) + `db` (MariaDB), app waits for db healthcheck
- Local dev: run `db` service only, app via `pnpm dev`

## Key Conventions

- ESLint flat config (`eslint.config.mjs`) with `next/core-web-vitals` and `next/typescript`
- Tailwind v4 CSS-based config (no `tailwind.config.js`); dark mode via `prefers-color-scheme`
- Fonts: Geist Sans + Geist Mono via `next/font/google` as CSS variables

## Development Guidelines

### 새 기능 추가 순서
1. `src/types/`에 타입 정의
2. `src/lib/schemas/`에 Zod 스키마 작성
3. `src/hooks/queries/`에 API 훅 추가
4. 컴포넌트 생성
5. `src/app/(sub)/`에 라우트 추가
6. `/storybook/`에 데모 페이지 추가 (공통 컴포넌트인 경우)

### TanStack Query
- `query-keys.ts`에 쿼리 키 팩토리 패턴으로 정의
- 계층적 키 사용으로 캐시 무효화 관리
- 의존적 쿼리는 `enabled` 옵션 사용
- **글로벌 로딩 스피너**: `useMutation` 사용 시 `GlobalMutationSpinner`가 자동으로 CubeLoader 오버레이 표시
  - Query(조회): 각 컴포넌트에서 `isPending`으로 개별 로딩 처리
  - Mutation(변경): 글로벌 스피너 자동 적용 (별도 코드 불필요)
  - 상세: `reference-docs/Global-Loading-Spinner-guide.md`

### Code Quality
- 커밋 전 `pnpm lint` 실행
- TypeScript strict mode 준수
- `any` 타입 사용 금지

### React Compiler 규칙 (중요)
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

## Memo

- 코드 작성시 @/docs/coding-conventions.md 문서를 반드시 참조한다.
- 모든 답변과 추론과정은 한국어로 작성한다.
- task를 완료하면 린트체크, 타입체크, 빌드체크를 반드시 수행하고, 경고가 있더라도 최대한 해결하기 위해 노력한다.