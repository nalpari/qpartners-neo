# 코딩 컨벤션

QPartners Neo 프로젝트의 코딩 컨벤션을 정의합니다.

## 1. TypeScript

- `strict: true` 모드 사용
- `any` 사용 금지 — 불가피한 경우 `unknown`으로 대체 후 타입 가드 사용
- 인터페이스 정의 시 `I` 접두사 사용하지 않음 (e.g. `AppState`, ~~`IAppState`~~)
- 타입 import 시 `import type` 사용

```tsx
// Good
import type { Metadata } from "next";

// Bad
import { Metadata } from "next";
```

## 2. 파일/폴더 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 페이지/레이아웃 | Next.js 규칙 따름 | `page.tsx`, `layout.tsx`, `loading.tsx` |
| 컴포넌트 파일 | kebab-case | `user-card.tsx`, `nav-bar.tsx` |
| 유틸/라이브러리 | kebab-case | `prisma.ts`, `query-provider.tsx` |
| Zustand 스토어 | kebab-case + store 접미사 | `store.ts`, `auth-store.ts` |
| 타입 정의 파일 | kebab-case | `types.ts`, `user-types.ts` |

## 3. 컴포넌트

### 함수 선언

- `export default function` 형태로 페이지/레이아웃 컴포넌트 선언
- 재사용 컴포넌트는 named export 사용

```tsx
// 페이지 컴포넌트 — default export
export default function Home() { ... }

// 재사용 컴포넌트 — named export
export function QueryProvider({ children }: { children: React.ReactNode }) { ... }
```

### Server / Client 구분

- 기본적으로 모든 컴포넌트는 Server Component
- 클라이언트 상태/이벤트가 필요한 경우에만 파일 최상단에 `"use client"` 선언
- `"use client"` 경계를 최대한 아래(leaf)로 내려서 서버 컴포넌트 영역 유지

## 4. 스타일링

### Tailwind CSS v4

- CSS 기반 설정 사용 (`globals.css` 내 `@theme inline`)
- `tailwind.config.js` 사용하지 않음
- 커스텀 색상은 CSS 변수로 정의하고 `@theme inline`으로 등록

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}
```

### 다크 모드

- `prefers-color-scheme` 미디어 쿼리 기반 (시스템 설정 연동)
- Tailwind의 `dark:` 접두사 사용

```tsx
<div className="bg-white dark:bg-black">
```

### 클래스 작성 순서

레이아웃 → 크기 → 간격 → 타이포그래피 → 색상 → 기타 순서로 작성합니다:

```tsx
className="flex items-center w-full h-12 px-5 text-base font-medium text-background bg-foreground rounded-full transition-colors hover:bg-[#383838]"
```

## 5. Import 순서

1. 외부 라이브러리 (`next`, `react`, 3rd-party)
2. 내부 모듈 (`@/lib/*`, `@/components/*`)
3. 상대 경로 (CSS, 로컬 파일)

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";
```

## 6. 경로 별칭

- 항상 `@/` 경로 별칭 사용 (상대 경로 `../` 사용 금지)

```tsx
// Good
import { prisma } from "@/lib/prisma";

// Bad
import { prisma } from "../../lib/prisma";
```

## 7. Prisma

- 스키마 변경 후 반드시 `npx prisma generate` 실행
- PrismaClient import는 `@/generated/prisma/client`에서
- 앱 전체에서 `@/lib/prisma`의 싱글톤 인스턴스(`prisma`)를 사용
- 모델명: PascalCase 단수형 (e.g. `User`, `Post`, `Company`)
- 필드명: camelCase (e.g. `createdAt`, `userId`)

## 8. 상태 관리

### Zustand (클라이언트 UI 상태)

- 스토어는 `src/lib/` 하위에 위치
- 스토어명: `use{Domain}Store` 패턴 (e.g. `useAppStore`, `useAuthStore`)
- 인터페이스를 먼저 정의하고 `create<T>()` 제네릭 사용

```ts
interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
```

### TanStack Query (서버 데이터)

- QueryProvider가 root layout에서 앱 전체를 감싸고 있음
- 기본 staleTime: 60초
- query key는 배열 형태로 도메인별 네임스페이스 사용: `["users"]`, `["users", id]`

## 9. 환경 변수

| 변수 | 용도 | 사용 위치 |
|------|------|----------|
| `DATABASE_URL` | Prisma CLI (migration, generate) | prisma.config.ts |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | 런타임 DB 연결 | src/lib/prisma.ts |

- `.env` 파일은 gitignore 처리됨
- Docker 환경에서는 `docker-compose.yml`의 environment로 주입
