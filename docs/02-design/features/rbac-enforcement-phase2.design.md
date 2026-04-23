# RBAC Enforcement Phase 2 Design Document

> **Summary**: `requireMenuPermission(menuCode, action)` 공용 가드 신설 + 핵심 4개 도메인(14 파일) 교체 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-23
> **Status**: Draft
> **Planning Doc**: [rbac-enforcement-phase2.plan.md](../../01-plan/features/rbac-enforcement-phase2.plan.md)
> **Branch**: `feature/rbac-enforcement-phase2` (base: `development`)

---

## 1. Architecture Overview

### 1.1 권한 판정 계층

```
┌─────────────────────────────────────────────────────────────────┐
│  Route Handler (14 파일)                                         │
│  const auth = await requireMenuPermission(                      │
│    request.headers, "CONTENT", "create"                         │
│  );                                                             │
│  if (auth instanceof NextResponse) return auth;                 │
│  const { user } = auth;                                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  requireMenuPermission(headers, menuCode, action)               │
│  1. getUserFromHeaders()           → 401                        │
│  2. resolveMenuPermission(user, menuCode)                       │
│  3. permission[action] === true ?  → 통과 : 403                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  resolveMenuPermission(user, menuCode) — 공용 헬퍼              │
│  - SUPER_ADMIN → { r,c,u,d } 모두 true (fail-open, DB 조회 스킵)│
│  - 그 외       → QpRoleMenuPermission + menu.isActive=true     │
│                  조회, 없으면 { r,c,u,d } 모두 false (fail-closed)│
└──────────────────────────────┬──────────────────────────────────┘
                               │ (공유)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  GET /api/auth/me/permissions — 기존 엔드포인트                  │
│  resolveMenuPermission() 을 모든 활성 메뉴에 대해 반복 호출      │
│  (또는 단일 쿼리 + 메모리 매핑 — 동일 정책)                       │
└─────────────────────────────────────────────────────────────────┘
```

**핵심 설계 원칙**: `requireMenuPermission` 과 `/auth/me/permissions` 가 동일한 `resolveMenuPermission` 헬퍼를 호출 → FE/BE 판정 결과 divergence 원천 차단.

---

## 2. 공용 가드 시그니처 및 타입

### 2.1 `MenuCode` 리터럴 유니온

파일: `src/lib/schemas/menu.ts` (신규 또는 기존 위치)

```typescript
// 시드(prisma/seed.mjs)와 단일 소스. 오타 시 TS 컴파일 에러.
export const MENU_CODES = [
  "HOME",
  "CONTENT",
  "INQUIRY",
  "MYPAGE",
  "MEMBERS",
  "BULK_MAIL",
  "NOTICES",
  "CATEGORIES",
  "CODES",
  "MENUS",
  "ROLES",
  "PERMISSIONS",
] as const;

export type MenuCode = (typeof MENU_CODES)[number];
```

> **Note**: PR #72 `roles/[roleCode]/permissions/route.ts` 의 `restrictedMenuCodeSet` 타입 좁히기(커밋 `ea54982`) 맥락과 연속.

### 2.2 `MenuAction` 리터럴 유니온

```typescript
export const MENU_ACTIONS = ["read", "create", "update", "delete"] as const;
export type MenuAction = (typeof MENU_ACTIONS)[number];
```

### 2.3 `resolveMenuPermission` — 공용 헬퍼

파일: `src/lib/auth.ts` (또는 `src/lib/menu-permission.ts` 분리 — 결정 필요)

```typescript
export type MenuPermission = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

/**
 * 사용자·메뉴에 대한 CRUD 권한 해석 — 단일 진실.
 *
 * - SUPER_ADMIN: DB 조회 스킵, 전부 true (fail-open)
 * - 그 외:
 *   · 시드 미등록 menuCode → 전부 false (fail-closed)
 *   · menu.isActive=false → 전부 false (fail-closed)
 *   · 정상 조회: QpRoleMenuPermission 의 canRead/canCreate/canUpdate/canDelete 반환
 */
export async function resolveMenuPermission(
  user: UserInfo,
  menuCode: MenuCode,
): Promise<MenuPermission> {
  if (user.role === "SUPER_ADMIN") {
    return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
  }

  const row = await prisma.qpRoleMenuPermission.findFirst({
    where: {
      roleCode: user.role,
      menuCode,
      menu: { isActive: true },
    },
    select: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
  });

  if (!row) {
    return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  }
  return row;
}
```

### 2.4 `requireMenuPermission` — 가드 함수

```typescript
/**
 * 메뉴 권한 매트릭스 기반 가드.
 *
 * @returns `{ user }` 통과 시 / `NextResponse` 401·403 시
 */
export async function requireMenuPermission(
  headers: Headers,
  menuCode: MenuCode,
  action: MenuAction,
): Promise<{ user: UserInfo } | NextResponse> {
  const user = getUserFromHeaders(headers);
  if (!user) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }

  const perm = await resolveMenuPermission(user, menuCode);
  const actionToKey: Record<MenuAction, keyof MenuPermission> = {
    read: "canRead",
    create: "canCreate",
    update: "canUpdate",
    delete: "canDelete",
  };

  if (!perm[actionToKey[action]]) {
    return NextResponse.json(
      { error: "権限がありません", menuCode, action },
      { status: 403 },
    );
  }
  return { user };
}
```

**응답 바디 형식**: `{ error, menuCode, action }` — PR #72 PUT `/roles/[roleCode]/permissions` 의 거부 응답과 통일.

### 2.5 `/auth/me/permissions` 재작성 (divergence 제거)

기존 `src/app/api/auth/me/permissions/route.ts` 도 `resolveMenuPermission` 을 사용하도록 리팩토링:

```typescript
// SUPER_ADMIN / 일반 roleCode 둘 다 동일 경로로 통합
const activeMenus = await prisma.menu.findMany({
  where: { isActive: true },
  select: { menuCode: true, parentId: true, sortOrder: true },
  orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
});

const menus = await Promise.all(
  activeMenus.map(async (m) => {
    const perm = await resolveMenuPermission(user, m.menuCode as MenuCode);
    return { menuCode: m.menuCode, ...perm };
  }),
);
```

> **성능 주의**: SUPER_ADMIN 은 DB 쿼리 스킵하므로 활성 메뉴 수 × 0ms. 그 외는 N 쿼리 발생. 현재 메뉴 12개 기준 12 쿼리 — 허용 범위. Phase 5 에서 단일 쿼리 + 메모리 매핑으로 최적화 검토.

---

## 3. 라우트 교체 매핑 테이블

### 3.1 CONTENT (menuCode: `CONTENT`)

| 파일 | 라인 (변경 전) | HTTP Method | action |
|------|--------------|:----------:|:------:|
| `src/app/api/contents/route.ts` | 200 | POST | create |
| `src/app/api/contents/[id]/route.ts` | 151 | PUT | update |
| `src/app/api/contents/[id]/route.ts` | 260 | DELETE | delete |
| `src/app/api/contents/[id]/files/route.ts` | 19 | POST | create (첨부 추가) |
| `src/app/api/contents/[id]/files/[fileId]/route.ts` | 32 | PUT | update (첨부 교체) |
| `src/app/api/contents/[id]/files/[fileId]/route.ts` | 160 | DELETE | delete |

> **주의**: `contents/route.ts` 의 **GET (목록)** 은 현재 `requireAdmin` 없이 동작 (사내/외부 분리 처리). 교체 대상 아님.

### 3.2 MEMBERS (menuCode: `MEMBERS`)

| 파일 | 라인 | HTTP Method | action |
|------|------|:----------:|:------:|
| `src/app/api/admin/members/route.ts` | 20 | GET+PUT+... | **메소드별 매핑 확인 필요** |
| `src/app/api/admin/members/[id]/route.ts` | 148 | - | - |
| `src/app/api/admin/members/[id]/route.ts` | 237 | - | - |
| `src/app/api/admin/members/[id]/reset-password/route.ts` | 27 | POST | update (비번 초기화는 사용자 리소스 변경) |

> **Design 상세 시 확인**: `admin/members/route.ts` 는 GET/POST 여러 메소드가 한 파일에 있을 수 있음. 교체 구현 시 각 export 함수별로 action 매핑.

### 3.3 BULK_MAIL (menuCode: `BULK_MAIL`)

| 파일 | 라인 | HTTP Method | action |
|------|------|:----------:|:------:|
| `src/app/api/admin/mass-mails/route.ts` | 52 | GET | read |
| `src/app/api/admin/mass-mails/route.ts` | 299 | POST | create |
| `src/app/api/admin/mass-mails/[id]/route.ts` | 35 | GET | read |
| `src/app/api/admin/mass-mails/[id]/route.ts` | 154 | PUT | update |
| `src/app/api/admin/mass-mails/[id]/route.ts` | 242 | DELETE | delete |
| `src/app/api/admin/mass-mails/[id]/retry/route.ts` | 15 | POST | update (재발송은 기존 작업 상태 변경) |

### 3.4 CODES (menuCode: `CODES`)

| 파일 | 라인 | HTTP Method | action |
|------|------|:----------:|:------:|
| `src/app/api/codes/route.ts` | 13 | GET | read |
| `src/app/api/codes/route.ts` | 46 | POST | create |
| `src/app/api/codes/[id]/route.ts` | 15 | PUT | update |
| `src/app/api/codes/[id]/route.ts` | 47 | DELETE | delete |
| `src/app/api/codes/[id]/details/route.ts` | 15 | GET | read |
| `src/app/api/codes/[id]/details/route.ts` | 57 | POST | create |
| `src/app/api/codes/[id]/details/[detailId]/route.ts` | 15 | PUT | update |
| `src/app/api/codes/[id]/details/[detailId]/route.ts` | 86 | DELETE | delete |

### 3.5 교체 Diff 패턴 (공통)

**Before:**
```typescript
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;
    // ...
  } catch (error) { ... }
}
```

**After:**
```typescript
import { requireMenuPermission } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "CONTENT", "create");
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;
    // ...
  } catch (error) { ... }
}
```

> **Note**: `requireMenuPermission` 은 `async` — 기존 sync `requireAdmin` 호출부에 `await` 추가 필요.

---

## 4. Residual 이슈 반영 (PR #72 리뷰 이월)

### 4.1 I-1 — middleware authRole fallback

파일: `src/middleware.ts`

**As-Is (추정)**: `userTp`/`storeLvl` 조합이 예상 밖일 때 특정 authRole 로 fallback.

**To-Be**: PR #72 `resolveAuthRole` 의 최소권한 폴백 정책(STORE + storeLvl 불명 → `2ND_STORE`)과 **반드시 일치**. 다른 폴백 로직이 있으면 제거하고 `resolveAuthRole` 재사용.

> Design 완성 전 `src/middleware.ts` 현재 코드 확인 후 구체 diff 제시.

### 4.2 I-4 — broad catch narrowing

4개 도메인의 14개 파일 한정. `catch (error)` → `catch (error: unknown)` + Prisma 에러 구분 narrowing.

**패턴**:
```typescript
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return /* 409 */;
    if (error.code === "P2025") return /* 404 */;
  }
  console.error("[POST /api/...]", error);
  return NextResponse.json(
    { error: "サーバーエラーが発生しました" },
    { status: 500 },
  );
}
```

### 4.3 I-5 — `logError` Sentry 도입

신규 파일: `src/lib/log-error.ts`

```typescript
export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  // v1: console.error only (Sentry SDK 미도입 상태). 본 PR 에서는 인터페이스만 확정.
  console.error(`[${context}]`, error, extra);
  // v2 (후속 PR): Sentry.captureException(error, { tags: { context }, extra })
}
```

4개 도메인의 14개 파일에서 `console.error("[GET /api/...]", error)` 를 `logError("GET /api/...", error)` 로 교체.

---

## 5. OpenAPI 업데이트

파일: `src/lib/openapi.ts`

### 5.1 403 응답 description 갱신 (교체 대상 14 라우트)

```yaml
responses:
  "403":
    description: "メニュー権限がありません (RBAC: {menuCode}.{action})"
    content:
      application/json:
        schema:
          type: object
          properties:
            error: { type: string }
            menuCode: { type: string, enum: [HOME, CONTENT, ...] }
            action: { type: string, enum: [read, create, update, delete] }
```

### 5.2 변경 없음

- `PUT /api/roles/[roleCode]/permissions` 403 (SUPER_ADMIN 전용 유지) — PR #72 설계 보존
- `GET /api/codes/lookup` — 비인증 공개 (변경 없음)

---

## 6. File Structure

```
src/lib/
├── auth.ts                           # requireMenuPermission + resolveMenuPermission 추가
└── log-error.ts                      # NEW — logError 인터페이스

src/lib/schemas/
└── menu.ts                           # MENU_CODES / MenuCode / MENU_ACTIONS / MenuAction 정의
                                      # (또는 common.ts 에 통합)

src/app/api/auth/me/permissions/
└── route.ts                          # resolveMenuPermission 공유로 리팩토링

src/app/api/contents/route.ts                                   # POST 교체
src/app/api/contents/[id]/route.ts                              # PUT/DELETE 교체
src/app/api/contents/[id]/files/route.ts                        # POST 교체
src/app/api/contents/[id]/files/[fileId]/route.ts               # PUT/DELETE 교체

src/app/api/admin/members/route.ts                              # 전체 교체
src/app/api/admin/members/[id]/route.ts                         # 전체 교체
src/app/api/admin/members/[id]/reset-password/route.ts          # POST 교체

src/app/api/admin/mass-mails/route.ts                           # GET/POST 교체
src/app/api/admin/mass-mails/[id]/route.ts                      # GET/PUT/DELETE 교체
src/app/api/admin/mass-mails/[id]/retry/route.ts                # POST 교체

src/app/api/codes/route.ts                                      # GET/POST 교체
src/app/api/codes/[id]/route.ts                                 # PUT/DELETE 교체
src/app/api/codes/[id]/details/route.ts                         # GET/POST 교체
src/app/api/codes/[id]/details/[detailId]/route.ts              # PUT/DELETE 교체

src/lib/openapi.ts                    # 14 라우트 403 description 업데이트
```

---

## 7. Implementation Order

| # | 작업 | 파일 | 검증 |
|---|------|------|------|
| 1 | `MENU_CODES`/`MenuCode`/`MENU_ACTIONS`/`MenuAction` 정의 | `src/lib/schemas/menu.ts` | `pnpm lint` + 기존 PR #72 코드의 `menuCode` 리터럴 타입 호환성 |
| 2 | `resolveMenuPermission` 구현 | `src/lib/auth.ts` | Unit: SUPER_ADMIN / 시드 미등록 / 비활성 menu / 정상 케이스 |
| 3 | `requireMenuPermission` 구현 | `src/lib/auth.ts` | Unit: 401 / 403 / 통과 케이스 |
| 4 | `/auth/me/permissions` 리팩토링 | `src/app/api/auth/me/permissions/route.ts` | 응답 diff zero (기존 output 동일 보장) |
| 5 | `logError` 인터페이스 | `src/lib/log-error.ts` | 단순 console.error wrapper |
| 6 | CONTENT 5파일 교체 | (3.1 표) | 각 파일 로컬 테스트 |
| 7 | MEMBERS 3파일 교체 | (3.2 표) | 각 파일 로컬 테스트 |
| 8 | BULK_MAIL 3파일 교체 | (3.3 표) | 각 파일 로컬 테스트 |
| 9 | CODES 4파일 교체 | (3.4 표) | 각 파일 로컬 테스트 |
| 10 | OpenAPI 403 description 업데이트 | `src/lib/openapi.ts` | `/api-docs` 페이지 렌더 확인 |
| 11 | middleware I-1 fallback 재정렬 | `src/middleware.ts` | `resolveAuthRole` 과 일치 여부 수동 검증 |
| 12 | 전체 `pnpm lint` + `tsc --noEmit` + `pnpm build` | - | 모두 통과 |

---

## 8. Test Plan

### 8.1 Unit Tests (선택 — 본 PR 은 스크립트 테스트 없음 원칙이면 skip)

- `resolveMenuPermission`:
  - SUPER_ADMIN → `{ true, true, true, true }` (DB 호출 스킵)
  - ADMIN + CONTENT (매트릭스 O) → `{ true, true, true, true }`
  - ADMIN + CODES (매트릭스 X) → `{ true, false, false, false }` (read 는 매트릭스 O, CUD X)
  - 1ST_STORE + MEMBERS (매트릭스 X) → `{ false, false, false, false }`
  - 시드에 없는 menuCode → `{ false, false, false, false }`
  - menu.isActive=false → `{ false, false, false, false }`

### 8.2 수동 검증 (dev 환경)

| 케이스 | 기대 응답 |
|--------|----------|
| SUPER_ADMIN + POST /api/codes | 200/201 |
| ADMIN + POST /api/codes | **403** (behavioral change) |
| ADMIN + POST /api/contents | 200/201 (매트릭스 허용) |
| 1ST_STORE + GET /api/codes | **403** |
| 비인증 + POST /api/contents | 401 |
| SUPER_ADMIN + GET /api/auth/me/permissions | 응답 구조·값 PR #72 시점과 동일 |
| ADMIN + GET /api/auth/me/permissions | CODES canCreate/canUpdate/canDelete=false 확인 |

### 8.3 Regression 범위

- PR #72 에서 추가된 `/auth/me/permissions` 응답 일치 (diff zero)
- 나머지 22 라우트 변화 없음 (수동 stub 호출 몇 건)

---

## 9. Rollback Plan

변경 범위가 1 파일 전수 교체가 아닌 **14 파일 각각 1-line 수정 + 공용 가드 신설**이므로, 문제 발생 시:

1. **공용 가드 버그** (가장 리스크 높음): `src/lib/auth.ts` 의 `resolveMenuPermission` 만 revert → 14 라우트는 여전히 `requireMenuPermission` 호출하지만 내부 로직이 이전 상태로 복귀. 실제로는 함수 시그니처 유지하며 구현만 교체 불가 — 전체 revert 필요.
2. **특정 라우트만 이슈**: 해당 파일만 `requireAdmin` 으로 부분 revert 가능 (공용 가드는 유지).
3. **매트릭스 오류** (예: ADMIN 이 CODES CUD 필요 판명): **Phase 2 가 아닌 시드(`prisma/seed.mjs`) 수정**으로 해결. 코드 변경 없음.

---

## 10. Open Questions (착수 전 확정 필요)

| # | Question | 결정 방안 |
|---|----------|----------|
| Q1 | `MenuCode` / `MenuAction` 정의 위치: `src/lib/schemas/menu.ts` 신규 vs `src/lib/schemas/common.ts` 통합? | Design 검토 시 결정. 기본값: 별도 파일 (메뉴 도메인 전용) |
| Q2 | `resolveMenuPermission`·`requireMenuPermission` 위치: `src/lib/auth.ts` 에 추가 vs `src/lib/menu-permission.ts` 분리? | Design 검토 시 결정. 기본값: `auth.ts` 에 추가 (호출부 import 단순화) |
| Q3 | ADMIN + CODES CUD 실제 운영 이력 확인 — R1 리스크 | dev/stg DB 에서 최근 N 일 CODES CUD 이력 조회 (별도 SQL 스크립트) |
| Q4 | `/auth/me/permissions` 리팩토링을 본 PR 에 포함 vs 후속? | 기본: 본 PR 포함 (divergence 원천 차단이 Phase 2 핵심 가치) |
| Q5 | `logError` 인터페이스만 정의 vs Sentry SDK 도입까지? | 기본: 인터페이스만 (Sentry SDK 도입은 별도 PR — 설정 파일·env 변경 수반) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-23 | Initial draft | CK |
