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

### HTTP Client

- **Axios**: `src/lib/axios.ts` — `baseURL: "/api"` 설정된 공용 인스턴스, 클라이언트 컴포넌트에서 API 호출 시 사용

### Validation

- **Zod**: `src/lib/schemas/`에 입력 검증 스키마 정의, API Route Handler에서 `safeParse`로 검증

### Docker

- Multi-stage Dockerfile (`base` → `deps` → `builder` → `runner`) with `output: "standalone"`
- `docker-compose.yml`: `app` (Next.js) + `db` (MariaDB), app waits for db healthcheck
- Local dev: run `db` service only, app via `pnpm dev`

## Key Conventions

- ESLint flat config (`eslint.config.mjs`) with `next/core-web-vitals` and `next/typescript`
- Tailwind v4 CSS-based config (no `tailwind.config.js`); dark mode via `prefers-color-scheme`
- Fonts: Geist Sans + Geist Mono via `next/font/google` as CSS variables

## Development Guidelines

### 새 기능 추가 순서
1. `prisma/schema.prisma`에 모델 정의 → `pnpm prisma migrate dev --name <name>`
2. `src/lib/schemas/`에 Zod 스키마 작성
3. `src/app/api/`에 Route Handler 추가
4. 페이지 컴포넌트 생성 (`src/app/` 하위)

### TanStack Query
- `QueryProvider`가 root layout에서 앱 전체를 감싸고 있음 (`src/lib/query-provider.tsx`)
- 기본 staleTime: 60초
- query key는 배열 형태로 도메인별 네임스페이스 사용: `["tests"]`, `["tests", id]`

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

## Git Commit Message

### 형식

```
<type>: <subject>

<body (선택)>
```

### Type

| Type | 용도 |
|------|------|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 기능 변경 없는 코드 구조 개선 |
| `style` | 코드 포맷팅, 세미콜론 누락 등 (동작 변경 없음) |
| `docs` | 문서 변경 |
| `chore` | 빌드, 설정, 의존성 등 기타 변경 |
| `test` | 테스트 추가/수정 |

### 규칙

- subject는 **한글**, 50자 이내, 동사 원형으로 시작 (e.g. `Add`, `Fix`, `Update`)
- body는 선택사항이며, "무엇을 왜" 변경했는지 간결하게 서술
- body 작성 시 subject와 빈 줄로 구분

### 예시

```
feat: Add user authentication with JWT

Implement login/signup API routes with JWT token generation
and middleware-based route protection.
```

```
fix: Resolve prisma client singleton leak in dev mode
```

## Memo

- 코드 작성시 기본적으로 @/docs/coding-conventions.md 문서를 반드시 참조한다.
- 모든 답변과 추론과정은 한국어로 작성한다.
- task가 끝나면 서브 에이전트를 사용해서 린트체크, 타입체크, 빌드체크를 수행한다.
- 린트체크시 오류가 있으면 반드시 해결하고 넘어가도록 하고, 경고가 있더라도 해결하려고 노력한다.
- 커밋시에 접두사는 영어로 나머지 타이틀과 내용은 한국어로 작성한다.
- task 완료시 CLAUDE.md 및 README.md 문서에 업데이트가 필요하면 진행한다.

## Frontend

## Backend