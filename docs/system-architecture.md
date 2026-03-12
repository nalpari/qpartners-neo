# 시스템 아키텍처 정의서

> QPartners Neo — 2026-03-12 기준

## 1. 시스템 개요

Next.js 16 기반의 풀스택 웹 애플리케이션으로, Server Component와 Client Component를 혼합 사용하며 MariaDB를 데이터 저장소로 사용한다. Docker 기반의 컨테이너화된 배포 구조를 갖추고 있다.

## 2. 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| Framework | Next.js (App Router) | 16.1.6 |
| Runtime | React + React Compiler | 19.2.3 |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS (CSS-based config) | 4.x |
| Database | MariaDB | 11 |
| ORM | Prisma + MariaDB Adapter | 7.4.2 |
| Validation | Zod | 4.3.6 |
| HTTP Client | Axios | 1.13.6 |
| Server State | TanStack Query | 5.90.21 |
| Client State | Zustand | 5.0.11 |
| Package Manager | pnpm | latest |
| Container | Docker (multi-stage) | - |

## 3. 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  React 19    │  │ TanStack     │  │   Zustand     │  │
│  │  Components  │──│ Query        │  │   Store       │  │
│  │  (TSX)       │  │ (서버 상태)  │  │  (UI 상태)    │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │
│         │                 │                              │
│         │          ┌──────┴───────┐                      │
│         │          │    Axios     │                      │
│         │          │  (baseURL:   │                      │
│         │          │   /api)      │                      │
│         │          └──────┬───────┘                      │
└─────────┼─────────────────┼─────────────────────────────┘
          │                 │
          │  SSR/RSC        │  HTTP (JSON)
          │                 │
┌─────────┼─────────────────┼─────────────────────────────┐
│         │    Next.js Server                              │
│  ┌──────┴───────┐  ┌──────┴───────┐                     │
│  │   Server     │  │    Route     │                     │
│  │  Components  │  │   Handlers   │                     │
│  │  (직접 DB    │  │  (/api/*)    │                     │
│  │   조회)      │  └──────┬───────┘                     │
│  └──────┬───────┘         │                             │
│         │          ┌──────┴───────┐                      │
│         │          │  Zod Schema  │                      │
│         │          │  Validation  │                      │
│         │          └──────┬───────┘                      │
│         │                 │                              │
│  ┌──────┴─────────────────┴───────┐                     │
│  │       Prisma Client            │                     │
│  │   (Singleton + MariaDB Adapter)│                     │
│  └──────────────┬─────────────────┘                     │
└─────────────────┼───────────────────────────────────────┘
                  │  TCP :3306
┌─────────────────┼───────────────────────────────────────┐
│           MariaDB 11 (Docker)                           │
│  ┌──────────────┴─────────────────┐                     │
│  │    Database: development       │                     │
│  │    User: development           │                     │
│  └────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## 4. 디렉토리 구조

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # 루트 레이아웃 (QueryProvider 래핑)
│   ├── page.tsx                # 홈 페이지 (Server Component)
│   ├── globals.css             # Tailwind v4 테마 설정
│   ├── api/                    # API Route Handlers
│   │   └── tests/
│   │       ├── route.ts        # GET (목록), POST (생성)
│   │       └── [id]/route.ts   # GET (단건), PATCH (수정), DELETE (삭제)
│   └── tests/
│       └── page.tsx            # Tests CRUD 페이지 (Client Component)
├── lib/                        # 공유 유틸리티
│   ├── prisma.ts               # PrismaClient 싱글톤
│   ├── axios.ts                # Axios 인스턴스 (baseURL: /api)
│   ├── query-provider.tsx      # TanStack Query Provider
│   ├── store.ts                # Zustand 스토어
│   └── schemas/                # Zod 검증 스키마
│       └── test.ts
└── generated/prisma/           # Prisma 자동 생성 코드 (gitignored)
```

## 5. 데이터 레이어

### 5.1 데이터베이스

- **DBMS**: MariaDB 11 (Docker 컨테이너)
- **접속 정보**: 환경변수 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`으로 주입
- **ORM**: Prisma 7 + `@prisma/adapter-mariadb`

### 5.2 스키마

```prisma
model Test {
  id        Int      @id @default(autoincrement())
  title     String   @db.VarChar(255)
  content   String?  @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 5.3 PrismaClient 싱글톤 패턴

```
createPrismaClient()
  └─ PrismaMariaDb adapter 생성 (env vars 참조)
  └─ new PrismaClient({ adapter })

globalForPrisma.prisma ← 개발 모드에서 HMR 시 인스턴스 재사용
```

- adapter와 client를 함께 `createPrismaClient()` 내부에서 생성하여 HMR 시 커넥션 풀 고갈 방지

### 5.4 환경변수 분리 전략

| 변수 | 용도 | 계정 |
|------|------|------|
| `DATABASE_URL` | Prisma CLI (migration, generate, shadow DB) | `root` (DDL 권한 필요) |
| `DB_USER` / `DB_PASSWORD` | 앱 런타임 DB 연결 | `development` (DML 권한) |

## 6. API 설계

### 6.1 엔드포인트 목록

| Method | Path | 설명 | 검증 | 응답 코드 |
|--------|------|------|------|-----------|
| `GET` | `/api/tests` | 전체 목록 (createdAt DESC) | - | 200 / 500 |
| `POST` | `/api/tests` | 생성 | `createTestSchema` | 201 / 400 / 500 |
| `GET` | `/api/tests/:id` | 단건 조회 | - | 200 / 404 / 500 |
| `PATCH` | `/api/tests/:id` | 부분 수정 | `updateTestSchema` | 200 / 400 / 500 |
| `DELETE` | `/api/tests/:id` | 삭제 | - | 204 / 500 |

### 6.2 요청/응답 흐름

```
Client Request
  → Axios (baseURL: /api, Content-Type: application/json)
    → Next.js Route Handler
      → Zod safeParse (입력 검증)
        → Prisma Client (DB 쿼리)
          → JSON Response
```

### 6.3 에러 처리

모든 Route Handler는 try-catch로 감싸며, 에러 발생 시:
- `console.error`로 서버 로그 출력
- 클라이언트에 `{ error: string }` 형태의 500 응답 반환

## 7. 상태 관리

### 7.1 서버 상태 — TanStack Query

| 항목 | 설정 |
|------|------|
| Provider | `src/lib/query-provider.tsx` → `layout.tsx`에서 앱 전체 래핑 |
| staleTime | 60초 |
| Query Key | 배열 기반 네임스페이스: `["tests"]`, `["tests", id]` |
| 캐시 무효화 | `queryClient.invalidateQueries()` (mutation onSuccess) |

### 7.2 클라이언트 상태 — Zustand

| 항목 | 설정 |
|------|------|
| Store | `src/lib/store.ts` → `useAppStore` |
| 패턴 | `create<Interface>()` 제네릭 |
| 현재 상태 | `sidebarOpen` (boolean), `toggleSidebar`, `setSidebarOpen` |

### 7.3 사용 기준

| 데이터 유형 | 관리 방식 |
|-------------|----------|
| 서버 데이터 (읽기 전용) | Server Component에서 직접 DB 조회 |
| 서버 데이터 (클라이언트 인터랙션) | TanStack Query + Route Handler |
| UI 상태 (사이드바, 모달 등) | Zustand |

## 8. 스타일링

### 8.1 Tailwind CSS v4

- **설정 방식**: CSS 기반 (`globals.css` 내 `@theme inline`), `tailwind.config.js` 미사용
- **테마 토큰**: CSS 변수 → `@theme inline`으로 Tailwind에 등록
- **다크 모드**: `prefers-color-scheme` 미디어 쿼리 (시스템 설정 연동)

### 8.2 색상 체계

| 모드 | Background | Foreground |
|------|-----------|------------|
| Light | `#ffffff` | `#171717` |
| Dark | `#0a0a0a` | `#ededed` |

- UI 요소에는 `zinc` 팔레트 사용 (`zinc-200`, `zinc-700`, `zinc-900` 등)

### 8.3 폰트

- **Sans**: Geist Sans (`--font-geist-sans`, `next/font/google`)
- **Mono**: Geist Mono (`--font-geist-mono`, `next/font/google`)

## 9. 배포 아키텍처

### 9.1 Docker 멀티스테이지 빌드

```
[base]  Node 22 Alpine + pnpm
   ↓
[deps]  pnpm install --frozen-lockfile
   ↓
[builder]  prisma generate → pnpm build (standalone)
   ↓
[runner]  node server.js (non-root, port 3000)
```

### 9.2 Docker Compose 서비스

```
┌─────────────────┐     ┌─────────────────┐
│  qpartners-app  │────▶│  qpartners-db   │
│  (Next.js)      │     │  (MariaDB 11)   │
│  :3000          │     │  :3306          │
│                 │     │                 │
│  depends_on:    │     │  healthcheck:   │
│    db (healthy) │     │    innodb_init  │
└─────────────────┘     └─────────────────┘
                              │
                        ┌─────┴─────┐
                        │  db_data  │
                        │ (volume)  │
                        └───────────┘
```

### 9.3 실행 방법

```bash
# 로컬 개발 (DB만 Docker)
docker compose up -d db
pnpm dev

# 전체 스택 (Docker)
docker compose up -d --build
```

## 10. 보안 고려사항

| 항목 | 현재 상태 |
|------|----------|
| DB 계정 분리 | root (CLI) / development (런타임) 분리 |
| 입력 검증 | Zod 스키마로 API 입력값 검증 |
| 환경변수 | `.env` gitignore 처리 |
| Docker 실행 | non-root 유저 (`nextjs:1001`) |
| 인증/인가 | 미구현 (향후 추가 필요) |
| CORS | Next.js 기본 same-origin |

## 11. 개발 도구

| 도구 | 용도 |
|------|------|
| ESLint v9 (flat config) | `next/core-web-vitals` + `next/typescript` 규칙 |
| React Compiler | 자동 메모이제이션 최적화 |
| TypeScript strict | 타입 안전성 보장 |
| Prisma Studio | DB GUI (`npx prisma studio`) |
