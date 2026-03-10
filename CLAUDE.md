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

## Memo

- 코드 작성시 @/docs/coding-conventions.md 문서를 반드시 참조한다.
- 모든 답변과 추론과정은 한국어로 작성한다.
- task를 완료하면 린트체크, 타입체크, 빌드체크를 반드시 수행하고, 경고가 있더라도 최대한 해결하기 위해 노력한다.