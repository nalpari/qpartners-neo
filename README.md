# QPartners Neo

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router, React 19, React Compiler) |
| Styling | Tailwind CSS v4 |
| Database | MariaDB 11 (Docker) |
| ORM | Prisma 7 (`@prisma/adapter-mariadb`) |
| State (client) | Zustand |
| State (server) | TanStack Query |
| Package Manager | pnpm |
| Containerization | Docker (multi-stage build, standalone output) |

## Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start database

```bash
docker compose up -d db
```

### 3. Set up environment

`.env` 파일을 생성합니다:

```env
# Prisma CLI (migrations, generate)
DATABASE_URL="mysql://root:password@localhost:3306/qpartners"

# App runtime (adapter connection)
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD="password"
DB_NAME="qpartners"
```

### 4. Generate Prisma client & run migrations

```bash
pnpm prisma generate
pnpm prisma migrate dev --name init
```

### 5. Start dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm prisma generate` | Regenerate Prisma client |
| `pnpm prisma migrate dev --name <name>` | Create and apply migration |
| `pnpm prisma studio` | Open Prisma Studio (DB GUI) |

## Docker

### Full stack (production)

```bash
docker compose up -d --build
```

This starts both `app` (Next.js on port 3000) and `db` (MariaDB on port 3306). The app waits for the database healthcheck before starting.

### Local development

```bash
# DB only in Docker, app runs locally
docker compose up -d db
pnpm dev
```

## Project Structure

```
src/
├── app/                  # Next.js App Router pages & layouts
│   ├── layout.tsx        # Root layout (QueryProvider wraps here)
│   ├── page.tsx          # Home page
│   └── globals.css       # Tailwind config & theme tokens
├── lib/
│   ├── prisma.ts         # Prisma client singleton (MariaDB adapter)
│   ├── query-provider.tsx # TanStack Query provider (client component)
│   └── store.ts          # Zustand store
└── generated/prisma/     # Prisma generated client (gitignored)

prisma/
├── schema.prisma         # Database schema
└── migrations/           # Migration files
```
