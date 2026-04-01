---
globs:
  - "prisma/**"
  - "src/lib/prisma.ts"
  - "src/generated/**"
---
### Prisma / Data Layer 규칙

- **Database**: MariaDB 11 (Docker), Prisma 7 + `@prisma/adapter-mariadb`
- **Schema**: `prisma/schema.prisma` — Prisma CLI는 `DATABASE_URL` from `.env` via `prisma.config.ts`
- **Client**: `src/lib/prisma.ts` — Singleton PrismaClient with MariaDB adapter
  - 런타임 환경변수: `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`
- **Generated code**: `src/generated/prisma/` (gitignored) — import from `@/generated/prisma/client`
- 스키마 변경 후 반드시 `pnpm prisma generate` 실행
- 모델명: PascalCase 단수형 (e.g. `User`, `Post`)
- 필드명: camelCase (e.g. `createdAt`, `userId`)
- 앱 전체에서 `@/lib/prisma`의 싱글톤 인스턴스 사용
