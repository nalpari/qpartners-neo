# 개발 가이드

QPartners Neo 프로젝트의 개발 워크플로우와 패턴을 안내합니다.

## 1. 개발 환경 설정

### 필수 요구사항

- Node.js 22+
- pnpm
- Docker & Docker Compose

### 초기 설정

```bash
# 의존성 설치
pnpm install

# MariaDB 컨테이너 실행
docker compose up -d db

# .env 파일 생성 (아래 내용 참고)
cp .env.example .env  # 또는 수동 생성

# Prisma 클라이언트 생성 및 마이그레이션
pnpm prisma generate
pnpm prisma migrate dev --name init

# 개발 서버 실행
pnpm dev
```

### 환경 변수 (.env)

```env
DATABASE_URL="mysql://root:password@localhost:3306/qpartners"
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="qpartners"
DB_PASSWORD="interplug-dev"
DB_NAME="qpartners"
```

## 2. 프로젝트 구조

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # 루트 레이아웃 (QueryProvider 포함)
│   ├── page.tsx            # 홈 페이지
│   ├── globals.css         # Tailwind 테마 토큰 정의
│   └── api/                # Route Handlers (API 엔드포인트)
├── components/             # 재사용 UI 컴포넌트
├── lib/                    # 유틸리티 및 설정
│   ├── prisma.ts           # DB 클라이언트 (싱글톤)
│   ├── query-provider.tsx  # TanStack Query 프로바이더
│   └── store.ts            # Zustand 스토어
└── generated/prisma/       # Prisma 자동 생성 (gitignored)

prisma/
├── schema.prisma           # DB 스키마 정의
└── migrations/             # 마이그레이션 파일
```

## 3. 데이터 패턴

### 읽기 전용 데이터 — Server Component 직접 쿼리

별도의 API 레이어 없이 Server Component에서 Prisma로 직접 데이터를 조회합니다.

```tsx
// src/app/users/page.tsx (Server Component)
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const users = await prisma.user.findMany();

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

### 쓰기 — Server Action

데이터 변경은 Server Action으로 처리합니다.

```tsx
// src/app/users/actions.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  await prisma.user.create({ data: { name } });
}
```

```tsx
// src/app/users/create-form.tsx
"use client";

import { createUser } from "./actions";

export function CreateUserForm() {
  return (
    <form action={createUser}>
      <input name="name" required />
      <button type="submit">생성</button>
    </form>
  );
}
```

### 클라이언트 인터랙션 — TanStack Query + Route Handler

실시간 업데이트, 낙관적 업데이트, 무한 스크롤 등이 필요한 경우 사용합니다.

```tsx
// src/app/api/users/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const users = await prisma.user.findMany();
  return NextResponse.json(users);
}
```

```tsx
// 클라이언트 컴포넌트에서 사용
"use client";

import { useQuery } from "@tanstack/react-query";

export function UserList() {
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((res) => res.json()),
  });

  return <ul>{users?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

### 패턴 선택 기준

| 상황 | 패턴 |
|------|------|
| 페이지 로드 시 데이터 표시 | Server Component 직접 쿼리 |
| 폼 제출, 데이터 생성/수정/삭제 | Server Action |
| 실시간 갱신, 폴링, 낙관적 업데이트 | TanStack Query + Route Handler |
| 검색 필터, 정렬 등 클라이언트 인터랙션 | TanStack Query + Route Handler |
| 모달, 사이드바, UI 토글 | Zustand |

## 4. Prisma 스키마 관리

### 모델 추가

`prisma/schema.prisma`에 모델을 추가합니다:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 마이그레이션 적용

```bash
# 마이그레이션 생성 및 적용 (개발)
pnpm prisma migrate dev --name add-user-model

# Prisma 클라이언트 재생성 (마이그레이션 시 자동 실행됨)
pnpm prisma generate

# DB 상태를 GUI로 확인
pnpm prisma studio
```

### 주의사항

- 스키마 변경 후 반드시 `pnpm prisma generate` 실행 (migration 시 자동 포함)
- `src/generated/prisma/`는 gitignore — 각 환경에서 `pnpm prisma generate`로 생성
- 프로덕션 배포 시 `pnpm prisma migrate deploy` 사용

## 5. Docker 운영

### 로컬 개발 (DB만 Docker)

```bash
docker compose up -d db
pnpm dev
```

### 전체 스택 실행 (프로덕션 모드)

```bash
docker compose up -d --build
```

### 앱만 리빌드

```bash
docker compose up -d --build app
```

### 로그 확인

```bash
# 전체
docker compose logs -f

# 앱만
docker compose logs -f app

# DB만
docker compose logs -f db
```

### DB 접속

```bash
docker exec -it qpartners-db mariadb -u root -ppassword qpartners
```

## 6. 주요 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발 서버 (http://localhost:3000) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm lint` | ESLint 실행 |
| `pnpm prisma generate` | Prisma 클라이언트 재생성 |
| `pnpm prisma migrate dev --name <name>` | 마이그레이션 생성 및 적용 |
| `pnpm prisma studio` | Prisma Studio (DB GUI) |
| `docker compose up -d db` | MariaDB 컨테이너 시작 |
| `docker compose up -d --build` | 전체 스택 빌드 및 시작 |
| `docker compose down` | 컨테이너 중지 및 제거 |
| `docker compose down -v` | 컨테이너 + 볼륨(DB 데이터) 제거 |
