@AGENTS.md

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

- **Framework**: Next.js 16.2, App Router (`src/app/`), React 19, React Compiler enabled
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`; theme tokens in `src/app/globals.css` using `@theme inline`
- **Path alias**: `@/*` maps to `./src/*`
- **Database**: MariaDB 11 (Docker), Prisma 7
- **State**: Zustand (client UI) + TanStack Query (server data)
- **Validation**: Zod schemas in `src/lib/schemas/`

## Key Conventions

- ESLint flat config (`eslint.config.mjs`) with `next/core-web-vitals` and `next/typescript`
- Tailwind v4 CSS-based config (no `tailwind.config.js`); dark mode via `prefers-color-scheme`
- TypeScript strict mode, `any` 타입 사용 금지
- 커밋 전 `pnpm lint` 실행

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
- task가 끝나면 서브 에이전트를 사용해서 **린트체크**, **타입체크**, **빌드체크**를 수행한다.
- 린트체크시 오류가 있으면 반드시 해결하고 넘어가도록 하고, 경고가 있더라도 해결하려고 노력한다.
- 커밋시에 접두사는 영어로 나머지 타이틀과 내용은 한국어로 작성한다.
- task 완료시 CLAUDE.md 및 README.md 문서에 업데이트가 필요하면 진행한다.
- 에이전트 팀을 활용할 경우 @docs/agent-teams-guild.md 문서를 참조한다.

