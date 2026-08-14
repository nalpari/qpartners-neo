<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## Memo

- 코드 작성시 기본적으로 @docs/coding-conventions.md 문서를 반드시 참조한다.
- 모든 답변과 추론과정은 한국어로 작성한다.
- task가 끝나면 서브 에이전트를 사용해서 **린트체크**, **타입체크**, **빌드체크**를 수행한다.
- 린트체크시 오류가 있으면 반드시 해결하고 넘어가도록 하고, 경고가 있더라도 해결하려고 노력한다.
- 에이전트 팀을 활용할 경우 @docs/agent-teams-guide.md 문서를 참조한다.
- 코드가 수정된 경우 필요하다면 AGENTS.md, README.md 문서를 반드시 업데이트한다.
- 코드가 수정되었을 경우 필요하다면 graphify update . 명령어를 실행한다.

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
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss` (theme tokens in `src/app/globals.css` using `@theme inline`) + SCSS layer in `src/style/`
- **Path alias**: `@/*` maps to `./src/*`
- **Database**: MariaDB 11 (Docker), Prisma 7
- **State**: Zustand (client UI) + TanStack Query (server data)
- **Validation**: Zod schemas in `src/lib/schemas/`
- **Auth**: JWT cookie (`jose`) — `src/middleware.ts`에서 API 보호 (PUBLIC_PATHS 화이트리스트), RBAC은 `src/lib/rbac-guard.ts` / `src/lib/auth-role.ts`
- **Editor/Grid**: Tiptap 리치 에디터 (`src/lib/rich-editor/`), ag-grid (콘텐츠 목록)
- **Mail**: nodemailer (`src/lib/mailer.ts`, `src/lib/mail-templates/`, `src/lib/mass-mail/`)
- **API Docs**: Scalar (`/api-docs`), 스펙은 `src/lib/openapi.ts`
- **External**: QSP 회원 API 연동 (`src/lib/qsp-member.ts`)

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

- `<type>` 접두사만 **영어**, subject와 body는 **한글**로 작성
- subject는 50자 이내, "무엇을 했는지"를 간결하게 서술 (e.g. `~ 추가`, `~ 수정`, `~ 전환`)
- body는 선택사항이며, "무엇을 왜" 변경했는지 간결하게 서술
- body 작성 시 subject와 빈 줄로 구분

### 예시

```
feat: JWT 기반 사용자 인증 추가

로그인/회원가입 API route와 JWT 토큰 발급을 구현하고
미들웨어에서 라우트 보호를 적용한다.
```

```
fix: 개발 모드 Prisma 클라이언트 싱글톤 누수 수정
```

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
