---
globs:
  - "src/lib/store.ts"
  - "src/lib/*-store.ts"
  - "src/lib/query-provider.tsx"
---
### 상태 관리 규칙

#### Server Data
- Server Component에서 직접 DB 쿼리 (읽기 전용 데이터)
- 클라이언트 상호작용 필요 시 TanStack Query + Route Handlers (`/api/*`)

#### TanStack Query
- `QueryProvider`가 root layout에서 앱 전체를 감싸고 있음 (`src/lib/query-provider.tsx`)
- 기본 staleTime: 60초
- query key는 배열 형태로 도메인별 네임스페이스 사용: `["tests"]`, `["tests", id]`

#### Zustand (클라이언트 UI 상태)
- 스토어는 `src/lib/` 하위에 위치
- 스토어명: `use{Domain}Store` 패턴 (e.g. `useAppStore`, `useAuthStore`)
- 인터페이스를 먼저 정의하고 `create<T>()` 제네릭 사용
