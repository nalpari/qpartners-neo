---
globs:
  - "Dockerfile"
  - "docker-compose.yml"
  - ".dockerignore"
---
### Docker 규칙

- Multi-stage Dockerfile (`base` → `deps` → `builder` → `runner`) with `output: "standalone"`
- `docker-compose.yml`: `app` (Next.js) + `db` (MariaDB), app waits for db healthcheck
- Local dev: `db` 서비스만 실행 (`docker compose up -d db`), 앱은 `pnpm dev`로 실행

#### 환경 변수
| 변수 | 용도 | 사용 위치 |
|------|------|----------|
| `DATABASE_URL` | Prisma CLI (migration, generate) | prisma.config.ts |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | 런타임 DB 연결 | src/lib/prisma.ts |

- `.env` 파일은 gitignore 처리됨
- Docker 환경에서는 `docker-compose.yml`의 environment로 주입
