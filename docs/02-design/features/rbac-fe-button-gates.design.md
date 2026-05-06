# RBAC FE Button Gates Design Document

> **Summary**: admin 7개 도메인 + 페이지 가드 보강 — **가드 패턴 표준화** + 컴포넌트별 적용 매핑
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-06
> **Status**: Draft
> **Planning Doc**: [rbac-fe-button-gates.plan.md](../../01-plan/features/rbac-fe-button-gates.plan.md)
> **Branch 전략**: 옵션 B — 2 PR 분할
>   - PR-1: `feature/rbac-fe-button-gates-phase1`
>   - PR-2: `feature/rbac-fe-button-gates-phase2`
> **Redmine**: #2183

---

## 1. Architecture Overview

### 1.1 권한 가드 3층 구조 (이미 완비)

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1 — 페이지 진입 가드 (서버 컴포넌트)                       │
│  await requirePageMenuPermission("ADM_MEMBER", "read");          │
│  · canRead=false → /admin redirect (또는 fallback URL)           │
│  · 비인증 → /login redirect                                       │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ (페이지 진입 통과)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2 — FE 버튼/액션 가드 ◀━━━━━━━━━━━━━━━ [본 PR 핵심]       │
│  const { canCreate, canUpdate, canDelete }                      │
│        = useMenuPermission("ADM_MEMBER");                       │
│  · false 인 액션 → 버튼 disabled / 숨김 / 폼 readonly             │
│  · 로딩 중 → fail-closed (단건) or permissive (컨테이너 필터)      │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ (사용자 클릭 → API 호출)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 3 — BE API 가드 (이미 완비, 본 PR 변경 0건)                │
│  await requireMenuPermission(headers, "ADM_MEMBER", "update");   │
│  · 매트릭스 false → 403 (FE 우회 시도 시 최종 방어선)              │
└──────────────────────────────────────────────────────────────────┘
```

**핵심 원칙**:
- Layer 2 (본 PR) 가 추가되어도 Layer 3 가 **항상 최종 방어선**
- Layer 2 가드 인자는 Layer 3 와 **byte-level 일치** (`menuCode`, `action`)
- Layer 2 가드는 UX 만 담당 — 보안적으로는 Layer 3 가 sufficient

### 1.2 데이터 흐름

```
GET /api/auth/me/permissions
  ↓ (TanStack Query staleTime: 5min, queryKey: ["me", "permissions"])
useMenuPermission(menuCode) / useMenuPermissionMap()
  ↓
컴포넌트 레벨에서 { canRead, canCreate, canUpdate, canDelete } 소비
  ↓
권한관리 UI 에서 mutation 후 `["me", "permissions"]` invalidate
  ↓
모든 admin 화면에 즉시 반영
```

---

## 2. 가드 패턴 표준화 (PR-1 머지 전 합의 필수)

### 2.1 5가지 표준 패턴

| # | 패턴 | 사용처 | 로딩 정책 | 시각 효과 |
|---|---|---|---|---|
| **A** | `<PermissionGate>` | 단일 버튼 (등록/삭제 등) — 선언적 차단이 자연스러운 곳 | fail-closed (children 미렌더) | 버튼 자체 숨김 |
| **B** | `useMenuPermission` + `disabled` | 인라인 버튼 (테이블 행 액션, 폼 저장 버튼) | fail-closed (`isLoading || !can*` → disabled) | 버튼 회색 비활성 |
| **C** | `useMenuPermission` + 조건부 렌더 | 폼 영역 전체 readonly (편집 모드 자체) | fail-closed (`isLoading || !canUpdate` → readonly) | 폼 자체 비표시 또는 input disabled |
| **D** | `useMenuPermissionMap.has()` | 컨테이너 필터 (GNB, 관리탭, 동적 다중 menuCode) | permissive (로딩 중 일단 표시) | 메뉴/탭 동적 노출 |
| **E** | 클릭 시점 alert 가드 (옵션) | 라우트 이동·복합 핸들러 — A/B/C 가 1차, E 가 2차 안전장치 | fail-closed (alert 후 return) | "権限がありません。" alert 띄우고 동작 차단 |

### 2.2 패턴 선택 결정 트리

```
권한 가드를 어떻게 적용할까?
│
├─ 다중 menuCode 동적 필터 (GNB 등)?
│   └─ ✅ 패턴 D (`useMenuPermissionMap.has()`) — 로딩 중 permissive
│
├─ 단일 액션 버튼 — 권한 없으면 "버튼 자체를 숨기는" UX 가 자연스러운가?
│   └─ ✅ 패턴 A (`<PermissionGate>`) — fail-closed 숨김
│      예: お知らせ「登録」 버튼, 권한관리「行追加」
│
├─ 단일 액션 버튼 — 권한 없어도 "버튼은 보여주되 disabled" UX 가 더 자연스러운가?
│   └─ ✅ 패턴 B (`useMenuPermission` + `disabled`)
│      예: 폼 「保存」, 회원 비번리셋(상세 popup 안)
│
├─ 폼 영역 전체 readonly?
│   └─ ✅ 패턴 C (`useMenuPermission` + 조건부 렌더)
│      예: member-detail-popup 의 MemberEditForm 자체 비표시
│
└─ ag-grid `cellRenderer` 안의 액션 아이콘?
    └─ ✅ 패턴 B 권장 (행 단위 disabled — cellRenderer params.context 로 권한 전달)
```

### 2.3 패턴별 코드 템플릿

#### 패턴 A — `<PermissionGate>` (선언적 숨김)

```tsx
import { PermissionGate } from "@/components/common";

<PermissionGate menuCode="ADM_NOTICE" action="create" fallback={null}>
  <Button variant="primary" onClick={handleRegister}>
    お知らせ登録
  </Button>
</PermissionGate>
```

**적용 사례**:
- お知らせ 「登録」 버튼 (`notices-table.tsx:461-463`)
- 권한관리 「行追加」 (`permissions-table.tsx:646`)
- 카테고리 트리 신규 추가 버튼
- 메뉴관리 신규 추가 버튼
- 코드관리 header/detail 신규 추가 버튼

#### 패턴 B — `useMenuPermission` + `disabled`

```tsx
import { useMenuPermission } from "@/hooks/use-menu-permission";

export function NoticesTable() {
  const { canDelete, isLoading: isPermLoading } = useMenuPermission("ADM_NOTICE");

  // 로딩 중에는 fail-closed (disabled)
  const canBulkDelete = !isPermLoading && canDelete;

  return (
    <Button
      variant="secondary"
      onClick={handleBulkDelete}
      disabled={!canBulkDelete || bulkDeleteMutation.isPending}
    >
      {bulkDeleteMutation.isPending ? "削除中..." : "削除"}
    </Button>
  );
}
```

**적용 사례**:
- お知らせ 일괄 「削除」 버튼 (`notices-table.tsx:454-460`)
- 폼 「保存」 버튼 (mode 에 따라 create/update)
- 대량메일 「下書き保存」, 「送信」, 「再送信」
- 메뉴관리 「保存」, 활성/비활성 토글

#### 패턴 C — `useMenuPermission` + 조건부 렌더 (폼 readonly)

```tsx
import { useMenuPermission } from "@/hooks/use-menu-permission";

export function MemberDetailPopup() {
  const { canUpdate, isLoading: isPermLoading } = useMenuPermission("ADM_MEMBER");

  // 기존 isReadOnly 조건과 OR — canUpdate=false 도 readonly 로 강제
  // 로딩 중도 readonly 로 fail-closed
  const isPermReadOnly = isPermLoading || !canUpdate;
  const isReadOnly = isWithdrawn || (isQspNotFound && member.status === "unknown") || isPermReadOnly;

  return (
    <>
      {!isReadOnly && (
        <MemberEditForm
          member={member}
          isQspNotFound={isQspNotFound}
          isSaving={isSaving}
          onSave={handleSave}
          onPasswordReset={handlePasswordReset}
          onClose={handleClose}
        />
      )}
      {isReadOnly && <MemberReadOnlyView member={member} />}
    </>
  );
}
```

**적용 사례**:
- `member-detail-popup.tsx` MemberEditForm 표시 조건
- bulk-mail-form.tsx 의 입력 필드 일괄 disabled

#### 패턴 D — `useMenuPermissionMap.has()` (다중 동적 필터)

기존 `header.tsx:246`, `admin-tab.tsx:77` 패턴 그대로 — 본 PR 신규 도입 없음.

#### 패턴 E — 클릭 시점 alert 가드 (옵션, 2차 안전장치)

이미 패턴 A/B/C 로 버튼이 숨김/비활성된 상태라도, 다음 경우에는 **클릭 시점에 한 번 더 권한 체크**:
- 라우트 이동 트리거 (예: `router.push`, `<Link>` href)
- 복합 핸들러 (action 시작 후 confirm dialog 등 다단계)
- 도달 경로가 다양한 메뉴 항목 (예: GNB)

```tsx
const { canUpdate, isLoading: isPermLoading } = useMenuPermission("ADM_NOTICE");
const { openAlert } = useAlertStore();

const handleEdit = () => {
  if (!isPermLoading && !canUpdate) {
    openAlert({ type: "alert", message: "権限がありません。" });
    return;  // 동작 중단
  }
  router.push(`/admin/notices/${id}/edit`);
};
```

**적용 가이드**:
- 단순 inline 액션 (테이블 행의 삭제 아이콘 등) → 패턴 B 만으로 충분, E 불요
- 라우트 이동·복합 핸들러 → A/B + E 결합 권장 (이중 보호)
- 기존 사례: `contents-detail.tsx:164-170` (handleEdit), `header.tsx:248-253` (GNB 클릭), `member-detail-popup.tsx` (PR #147 빈값 가드)

### 2.4 ag-grid `cellRenderer` 특수 처리

ag-grid 의 cellRenderer 는 React hook 직접 호출이 어려우므로 `params.context` 로 권한 전달:

```tsx
// 부모 컴포넌트에서
const { canUpdate, canDelete } = useMenuPermission("ADM_NOTICE");
const gridContext = useMemo(
  () => ({ canUpdate, canDelete, /* 기존 selectedIds, toggleOne 등 */ }),
  [canUpdate, canDelete, /* ... */],
);

<DataGrid
  columnDefs={columnDefs}
  rowData={items}
  context={gridContext}
/>

// cellRenderer 내부
function ActionCellRenderer(params: ICellRendererParams) {
  const { canUpdate, canDelete } = params.context;
  return (
    <div className="flex gap-2">
      <Button disabled={!canUpdate} onClick={handleEdit}>編集</Button>
      <Button disabled={!canDelete} onClick={handleDelete}>削除</Button>
    </div>
  );
}
```

### 2.5 로딩 중 정책 (재확인)

| 위치 | 정책 | 근거 |
|---|---|---|
| 단건 액션 (패턴 A/B/C) | fail-closed (`isLoading || !can*` → 차단) | 클릭 race window 차단 — 잠깐 표시됐다가 숨기면 권한 없는 요청이 떠나는 플래시 발생 |
| 컨테이너 필터 (패턴 D) | permissive (`isLoading` → 일단 표시) | GNB/관리탭이 로딩 중 빈 상태로 깜빡이면 네비 골격 붕괴 |

이 비대칭은 `use-menu-permission.ts` 주석 (line 145-156) 에 이미 명문화됨. 본 PR 도 정확히 따른다.

---

## 3. 컴포넌트별 상세 매핑

### 3.1 PR-1 — Phase 1

#### 3.1.1 `src/components/popup/member-detail-popup.tsx` (회원관리)

**현재 상태**: PR #147 로 빈값 가드 + readonly 분기 정비 완료. 권한 가드 미적용.

**적용 패턴**: **C** (폼 영역 readonly 조건 추가)

**변경 위치**:
```diff
+ import { useMenuPermission } from "@/hooks/use-menu-permission";

  export function MemberDetailPopup({ ... }) {
+   const { canUpdate, isLoading: isPermLoading } = useMenuPermission("ADM_MEMBER");
    ...
+   // 권한 매트릭스에 의한 readonly — 기존 isReadOnly 조건과 OR
+   const isPermReadOnly = isPermLoading || !canUpdate;
+   const effectiveReadOnly = isReadOnly || isPermReadOnly;

-   {/* 기존: !isReadOnly && <MemberEditForm /> */}
+   {!effectiveReadOnly && <MemberEditForm ... />}
+   {effectiveReadOnly && <MemberReadOnlyView member={member} />}
  }
```

**MemberEditForm 내부 가드** (비번리셋 버튼은 별도):
```diff
  function MemberEditForm({ ... }) {
+   const { canUpdate } = useMenuPermission("ADM_MEMBER");
    ...
-   <Button onClick={onPasswordReset}>パスワードリセット</Button>
+   <Button disabled={!canUpdate} onClick={onPasswordReset}>パスワードリセット</Button>
  }
```

**검증**:
- [ ] `ADM_MEMBER.update=false` 인 role → 회원 클릭 시 popup 진입은 가능 (read), 편집 폼 자체 비표시
- [ ] 비번리셋 / status 토글 / 권한 변경 / 2FA 토글 모두 비활성

#### 3.1.2 `src/components/admin/notices/notices-table.tsx` (お知らせ)

**적용 패턴**: **A** (등록 버튼) + **B** (일괄삭제 + 행 액션)

**변경 위치**:

```diff
+ import { PermissionGate } from "@/components/common";
+ import { useMenuPermission } from "@/hooks/use-menu-permission";

  export function NoticesTable() {
+   const { canDelete, canUpdate, isLoading: isPermLoading } = useMenuPermission("ADM_NOTICE");
    ...
+   // gridContext 에 권한 전달 (cellRenderer 행 액션용)
+   const gridContext = useMemo(
+     () => ({ selectedIds, toggleOne, canUpdate, canDelete, isPermLoading }),
+     [selectedIds, toggleOne, canUpdate, canDelete, isPermLoading],
+   );
    ...

    // 일괄삭제 — 패턴 B
-   <Button variant="secondary" onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending}>
+   <Button
+     variant="secondary"
+     onClick={handleBulkDelete}
+     disabled={isPermLoading || !canDelete || bulkDeleteMutation.isPending}
+   >

    // 등록 — 패턴 A
+   <PermissionGate menuCode="ADM_NOTICE" action="create" fallback={null}>
      <Button variant="primary" onClick={handleRegister}>お知らせ登録</Button>
+   </PermissionGate>
  }
```

**행별 cellRenderer 내부**:
- 편집 아이콘: `disabled={!params.context.canUpdate}` — **단, 작성자 가드(canModifyClient)와 AND**
- 삭제 아이콘: `disabled={!params.context.canDelete}` — **단, 작성자 가드와 AND**

**기존 작성자 가드와의 관계**:
- 작성자 가드(`canModifyClient`)는 본인 작성글 또는 SUPER_ADMIN/ADMIN 정책 — 별도 유지
- 권한 가드는 **AND 결합**: 작성자 가드 통과 + 매트릭스 canUpdate=true 둘 다 만족해야 활성

#### 3.1.3 `src/components/popup/notice-form-popup.tsx` (お知らせ 등록/수정 모달)

**적용 패턴**: **B** (저장 버튼) + **C** (수정 모드 readonly)

```diff
+ import { useMenuPermission } from "@/hooks/use-menu-permission";

  export function NoticeFormPopup({ mode, notice }: { mode: "create" | "edit"; notice: NoticeFormData }) {
+   const { canCreate, canUpdate, canDelete, isLoading: isPermLoading } = useMenuPermission("ADM_NOTICE");
+   const requiredAction = mode === "create" ? canCreate : canUpdate;
+   const isPermDenied = !isPermLoading && !requiredAction;
    ...
+   // 권한 없으면 폼 input 전체 disabled (저장 시도 자체 차단)
+   <fieldset disabled={isPermDenied}>
      {/* 기존 폼 내용 */}
+   </fieldset>

    {/* 「保存」 — 패턴 B */}
-   <Button onClick={handleSave}>保存</Button>
+   <Button disabled={isPermLoading || !requiredAction} onClick={handleSave}>保存</Button>

    {/* 「削除」 (수정 모드 한정) — 패턴 B */}
    {mode === "edit" && (
-     <Button variant="danger" onClick={handleDelete}>削除</Button>
+     <Button variant="danger" disabled={isPermLoading || !canDelete} onClick={handleDelete}>削除</Button>
    )}
  }
```

#### 3.1.4 `src/components/admin/permissions/permissions-table.tsx` (권한관리)

**적용 패턴**: **A** (행 추가 버튼) + **B** (저장 버튼 + 매트릭스 토글) + **C** (전체 readonly)

```diff
+ import { PermissionGate } from "@/components/common";
+ import { useMenuPermission } from "@/hooks/use-menu-permission";

  export function PermissionsTable() {
+   const { canCreate, canUpdate, canDelete, isLoading: isPermLoading } = useMenuPermission("ADM_PERMISSION");
+   const isPermDenied = !isPermLoading && !canUpdate;
    ...

    {/* 매트릭스 cellEditor (Y/N SelectBox) — context 로 전달 */}
+   const gridContext = useMemo(
+     () => ({ ...기존..., canUpdate, isPermDenied }),
+     [..., canUpdate, isPermDenied],
+   );

    {/* 「行追加」 — 패턴 A */}
+   <PermissionGate menuCode="ADM_PERMISSION" action="create" fallback={null}>
      <Button variant="outline" onClick={handleAdd}>行追加</Button>
+   </PermissionGate>

    {/* 「保存」 상단 — 패턴 B */}
-   <Button onClick={handleSave}>保存</Button>
+   <Button disabled={isPermLoading || !canUpdate} onClick={handleSave}>保存</Button>
  }
```

**SelectBox cellEditor**:
- `params.context.canUpdate=false` 면 cellEditor 자체 비활성화 (ag-grid `editable: (params) => params.context.canUpdate`)

### 3.2 PR-2 — Phase 2

#### 3.2.1 대량메일 (5 files + 페이지 가드)

**`bulk-mail-table.tsx`**: 패턴 A (등록), B (행 inline copy/delete)
**`bulk-mail-form.tsx`**: 패턴 B (저장/송신/재송신/삭제) + 패턴 C (입력 폼 fieldset disabled)
**`form/bulk-mail-form-info.tsx` / `targets.tsx` / `attachment.tsx`**: fieldset 또는 input 단위 `disabled` (부모에서 전달)

**페이지 진입 가드 추가** (PR-2 핵심 작업 1):
```diff
- // src/app/admin/bulk-mail/create/page.tsx (현재 "use client")
+ // src/app/admin/bulk-mail/create/page.tsx (server component 으로 변경)
+ import { requirePageMenuPermission } from "@/lib/rbac-guard";
+ import { BulkMailCreateClient } from "@/components/admin/bulk-mail/bulk-mail-create-client";
+
+ export default async function AdminBulkMailCreatePage() {
+   await requirePageMenuPermission("ADM_BULK_MAIL", "create", { fallback: "/admin/bulk-mail" });
+   return <BulkMailCreateClient />;
+ }
```

기존 `"use client"` 본문은 `BulkMailCreateClient` 로 분리.

#### 3.2.2 카테고리 (3 files)

**`categories-tree.tsx`**:
- 트리 신규 추가 버튼 — 패턴 A (`canCreate`)
- 트리 노드 컨텍스트 메뉴 (편집/삭제) — context 로 권한 전달, cellRenderer 패턴 B
- 드래그앤드롭 sort — 트리 옵션 `draggable: !isPermDenied` 으로 `canUpdate=false` 시 비활성

**`categories-detail.tsx`**: 패턴 B (저장/삭제)
**`use-category-mutations.ts`**: 변경 없음 (mutation 함수, 권한은 호출처)

#### 3.2.3 메뉴관리 (3 files)

**`menus-tables.tsx`**: 패턴 A (등록) + B (행 액션)
**`menus-info-form.tsx`**: 패턴 B (저장/삭제/활성토글)
**`menus-contents.tsx`**: 컨테이너 — 하위에 권한 prop drilling (또는 useMenuPermission 직접 호출)

#### 3.2.4 코드관리 (3 files)

**`codes-header-table.tsx`**: 패턴 A (header 신규) + B (header 행 inline 편집/삭제)
**`codes-detail-table.tsx`**: 패턴 A (detail 신규) + B (detail 행 inline 편집/삭제) + sort 비활성
**`codes-contents.tsx`**: 컨테이너 — 권한 prop drilling

---

## 4. 검증 시드 설계 (R3 Mitigation)

### 4.1 정책 전제 — admin 영역은 SUPER_ADMIN/ADMIN 전용

`/admin/*` 영역의 진입은 `admin/layout.tsx:40-42` 의 `isAdmin(role)` 분기로 SUPER_ADMIN/ADMIN 만 허용 — **본 PR 에서 변경하지 않음** (정책 결정, [project_admin_area_role_policy.md](C:\Users\ck\.claude\projects\C--workspace-qpartners-neo\memory\project_admin_area_role_policy.md) 참조).

따라서 신규 role (예: `READONLY_ADMIN`) 시드 후 검증하는 방식은 layout 차단으로 인해 검증 자체 불가능. 대신 **ADMIN role 의 매트릭스를 일시적으로 토글** 하여 검증한다.

### 4.2 검증 절차 — ADMIN role 매트릭스 임시 토글

검증 시 dev DB 에서 ADMIN role 의 매트릭스 행을 직접 UPDATE:

```sql
-- dev DB 한정 — 검증 시작 전 백업 필수
-- (예) ADM_NOTICE 의 update/delete 만 false 로 토글
UPDATE qp_role_menu_permissions
   SET can_update = false, can_delete = false
 WHERE role_code = 'ADMIN' AND menu_code = 'ADM_NOTICE';
```

검증 완료 후 원복:
```sql
UPDATE qp_role_menu_permissions
   SET can_update = true, can_delete = true
 WHERE role_code = 'ADMIN' AND menu_code = 'ADM_NOTICE';
```

또는 권한관리 UI 에서 SUPER_ADMIN 으로 직접 토글 (운영자 친화적, mutation invalidate 흐름까지 함께 검증).

### 4.3 검증 케이스 매트릭스

7 도메인 × 4 부분권한 조합 = **28 케이스** (ADMIN 매트릭스 토글):

각 도메인별 검증 시나리오:
- `read=true, create=false, update=false, delete=false` → 진입 가능, 모든 CUD 버튼 비활성/숨김 검증
- `read=true, create=true, update=false, delete=false` → 등록만 활성, 행별 편집·삭제 비활성
- `read=true, create=false, update=true, delete=false` → 수정만 활성 (행별 작성자 가드와 AND), 등록·삭제 비활성
- `read=true, create=false, update=false, delete=true` → 삭제만 활성, 등록·수정 비활성

Zero Script QA 로 시각 검증 (스크린샷 캡처 권장). **검증 후 매트릭스 즉시 원복 필수**.

### 4.4 주의사항

- 권한관리 화면 자체 검증 (`ADM_PERMISSION` 토글) 은 **마지막에 수행** — 잘못 토글하면 SUPER_ADMIN 만 매트릭스 복구 가능
- `ADM_PERMISSION.update=false` 토글 시 ADMIN 이 매트릭스를 다시 변경 못 하게 되므로 SUPER_ADMIN 계정 접근 가능 여부 사전 확인 필수
- production DB 에 절대 적용 금지 — dev/stg 환경 한정

---

## 5. 적용 순서 (체크리스트)

### PR-1 (Phase 1) 작업 순서

1. [ ] 가드 패턴 표준화 합의 (§2 — Design 리뷰 머지로 확정)
2. [ ] **회원관리** (`member-detail-popup.tsx`) — 패턴 C 적용
3. [ ] **お知らせ** (`notices-table.tsx` + `notice-form-popup.tsx`) — 패턴 A/B/C 적용
4. [ ] **권한관리** (`permissions-table.tsx`) — 패턴 A/B/C 적용
5. [ ] 검증 — ADMIN role 매트릭스 임시 토글로 3 도메인 × 4 액션 = 12 케이스 시각 검증 (검증 후 매트릭스 원복)
6. [ ] 회귀 — 콘텐츠 화면 정상 동작 확인 + GNB/관리탭 동작 확인
7. [ ] PR 생성 → 코드리뷰 → development 머지

### PR-2 (Phase 2) 작업 순서

8. [ ] PR-1 머지 + development sync
9. [ ] **대량메일** (5 files + `bulk-mail/create/page.tsx` + `bulk-mail/[id]/page.tsx`) — 패턴 A/B/C + 페이지 가드 추가
10. [ ] **카테고리** (3 files) — 패턴 A/B + 트리 드래그 비활성
11. [ ] **메뉴관리** (3 files) — 패턴 A/B
12. [ ] **코드관리** (3 files) — 패턴 A/B + sort 비활성
13. [ ] 검증 — 4 도메인 × 4 액션 = 16 케이스 시각 검증 + 페이지 가드 추가 검증
14. [ ] 회귀 — 모든 admin 화면 동작 확인
15. [ ] PR 생성 → 코드리뷰 → development 머지

### 머지 후 정리

16. [ ] ADMIN role 매트릭스 원복 확인 (검증 중 토글 잔존 여부 점검)
17. [ ] `/pdca analyze rbac-fe-button-gates` — gap 검증
18. [ ] Match Rate ≥ 90% → `/pdca report rbac-fe-button-gates`

---

## 6. Edge Cases & Decisions

### 6.1 폼 fieldset disabled vs 개별 input disabled

**선택**: `<fieldset disabled>` 을 우선. 폼 안의 모든 input/select/button 이 자동 비활성.

```tsx
<fieldset disabled={isPermDenied} style={{ border: "none", padding: 0 }}>
  {/* 폼 내용 */}
</fieldset>
```

**예외**: 일부 third-party 컴포넌트 (예: ag-grid editor) 가 `<fieldset>` 외부 portal 로 렌더되는 경우 — 해당 컴포넌트만 별도 prop 으로 disabled 전달.

### 6.2 버튼 숨김 vs 비활성화 — 어느 쪽이 더 자연스러운가

**기준**:
- **숨김 (패턴 A)**: 권한 없는 사용자가 그 버튼의 존재 자체를 알 필요 없음 (예: 등록 버튼)
- **비활성화 (패턴 B)**: 권한 있는 다른 사용자에게는 자연스러운 위치라 레이아웃이 깨지지 않게 자리 보존 (예: 행별 액션 아이콘)

표준 가이드:
- 상단 「登録」, 「行追加」, 「新規」 → 숨김 (A)
- 행별 inline 액션 (편집/삭제 아이콘) → 비활성화 (B)
- 폼 「保存」/「削除」 → 비활성화 (B) — readonly 모드도 폼 자체는 노출 가능
- 폼 input → fieldset disabled (C)

### 6.3 `canUpdate` 와 작성자 가드의 결합

콘텐츠/お知らせ 등 작성자 가드(`canModifyResource` 또는 `canModifyClient`) 가 별도 존재. 권한 매트릭스 가드와의 관계:

```typescript
const canEdit = !isPermLoading && canUpdate && canModifyClient(user, resource);
const canRemove = !isPermLoading && canDelete && canModifyClient(user, resource);
```

**AND 결합** — 둘 다 통과해야 활성. 어느 한쪽이 false 면 비활성.

이는 BE 와도 동일 — `requireMenuPermission(... "update")` 통과 후 핸들러 내부에서 `canModifyResource()` 추가 검증.

### 6.4 매트릭스 토글 후 권한 즉시 반영

권한관리 화면에서 mutation 후:
```typescript
queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
```

→ `useMenuPermission` 이 자동 refetch → 모든 admin 화면이 새 매트릭스로 즉시 재렌더.

**현재 `permissions-table.tsx` 의 mutation onSuccess 에 이미 `["role-labels"]` invalidate 가 적용 (PR #147)** — 추가로 `["me", "permissions"]` invalidate 도 필요. PR-1 작업에 포함.

### 6.5 비활성 메뉴(`menu.isActive=false`) 처리

BE `resolveMenuPermission` 이 비활성 메뉴를 fail-closed 로 처리하므로 `useMenuPermission` 결과가 자동으로 모두 false. 추가 처리 불요.

---

## 7. Test Scenarios (상세)

### 7.1 회귀 시나리오 (변화 없음 보장)

- [ ] SUPER_ADMIN 으로 7 도메인 모든 CUD 정상 동작
- [ ] ADMIN 으로 7 도메인 모든 CUD 정상 동작 (ADM_PERMISSION/ADM_MENU/ADM_CODE 의 update/delete 는 매트릭스상 false → 비활성 — 의도된 동작이며 회귀 아님)
- [ ] 1ST_STORE / 2ND_STORE / SEKO / GENERAL 으로 admin 화면 진입 차단 (페이지 가드 동작)
- [ ] 콘텐츠 화면 (`contents-table`, `contents-detail`) 의 기존 useMenuPermission 동작 변화 없음
- [ ] GNB / 관리탭의 메뉴 필터 동작 변화 없음

### 7.2 신규 시나리오 (READONLY_ADMIN 으로 검증)

각 도메인별로 4개 부분권한 조합 검증 (read 만 / read+create / read+update / read+delete):

#### 7.2.1 회원관리

| 부분권한 | 기대 동작 |
|---|---|
| `ADM_MEMBER.read=true` 만 | 회원목록 조회 / 회원 상세 popup 진입 / 편집 폼 비표시 (readonly view) |
| `+ canUpdate` | 편집 폼 표시 + 저장 활성 + 비번리셋 활성 |

#### 7.2.2 お知らせ

| 부분권한 | 기대 동작 |
|---|---|
| `ADM_NOTICE.read=true` 만 | 목록 조회 / 「登録」 숨김 / 일괄삭제 disabled / 행별 액션 disabled |
| `+ canCreate` | 「登録」 노출 / 모달 「保存」 활성 (create 모드 한정) |
| `+ canUpdate` | 행 편집 활성 / 모달 「保存」 활성 (edit 모드 한정) |
| `+ canDelete` | 일괄삭제 / 행 삭제 / 모달 「削除」 활성 |

#### 7.2.3 권한관리

| 부분권한 | 기대 동작 |
|---|---|
| `ADM_PERMISSION.read=true` 만 | 매트릭스 조회 / 「行追加」 숨김 / 「保存」 disabled / 셀 편집 비활성 |
| `+ canCreate` | 「行追加」 노출 |
| `+ canUpdate` | 「保存」 활성 / 셀 편집 활성 |
| `+ canDelete` | 행 삭제 활성 |

#### 7.2.4 대량메일/카테고리/메뉴관리/코드관리 — PR-2 동일 패턴

각 4개 부분권한 조합 → 16 케이스.

### 7.3 페이지 가드 추가 검증 (PR-2)

- [ ] `ADM_BULK_MAIL.create=false` 인 role 로 `/admin/bulk-mail/create` 직접 URL 접근 → `/admin/bulk-mail` 로 redirect
- [ ] `ADM_BULK_MAIL.read=false` 인 role 로 `/admin/bulk-mail/123` 직접 URL 접근 → fallback redirect

---

## 8. Open Questions

- [ ] **OQ-1**: 권한관리 mutation 시 `["me", "permissions"]` invalidate 를 PR-1 에 포함할지, 별도 micro PR 로 분리할지 — **결정**: PR-1 에 포함 (매트릭스 토글 즉시 반영이 본 작업의 핵심 가치)
- [ ] **OQ-2**: bulk-mail/create page 를 server 분리할 때 form 의 `useState`/`useQuery` (sessionStorage copy 데이터) 가 client 컴포넌트 그대로 유지 가능한지 — **확인 필요**: 현재 client 코드 그대로 별도 컴포넌트로 옮기면 동작
- [ ] **OQ-3**: ag-grid `editable: (params) => params.context.canUpdate` 가 정상 동작하는지 — **확인 필요**: ag-grid v32 docs 확인. 동작 안 하면 cell value setter 에서 차단

---

## 9. Related Documents

- **Plan**: [rbac-fe-button-gates.plan.md](../../01-plan/features/rbac-fe-button-gates.plan.md)
- **선행 BE**: [rbac-enforcement-phase2.design.md](./rbac-enforcement-phase2.design.md)
- **Redmine**: [#2183](http://gw.interplug.co.kr:43333/issues/2183)
- **Memory**: [project_rbac_fe_button_gates.md](C:\Users\ck\.claude\projects\C--workspace-qpartners-neo\memory\project_rbac_fe_button_gates.md)
- **Reference 컴포넌트**: `src/components/contents/list/contents-table.tsx:235`, `src/components/contents/detail/contents-detail.tsx:122` (적용 패턴 모범 사례)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-06 | Initial draft — 가드 패턴 4종 표준화 (A/B/C/D), 컴포넌트별 매핑, READONLY_ADMIN 검증 시드, 28 테스트 케이스 | CK |
| 0.2 | 2026-05-06 | 패턴 E (클릭 시점 alert 가드) 추가 — 5종 표준화. 검증 시드를 ADMIN role 매트릭스 토글 방식으로 변경 (admin 영역 SUPER_ADMIN/ADMIN 전용 정책 유지) | CK |
