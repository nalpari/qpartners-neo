# RBAC FE Button Gates Planning Document

> **Summary**: admin 7개 도메인 + 일부 페이지의 등록/수정/삭제 버튼·액션을 `useMenuPermission` / `<PermissionGate>` 로 가드. 권한관리 매트릭스 토글이 즉시 UX 에 반영되도록 정렬.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-06
> **Status**: Draft
> **Redmine**: [#2183 — [공통] 권한관리에서 관리되는 CRUD 의 정보를 기반으로 등록·수정·삭제 버튼 제어 적용](http://gw.interplug.co.kr:43333/issues/2183)
> **Branch 전략**: 옵션 B — 2 PR 분할 (사용자 확정 2026-05-06)
>   - PR-1: `feature/rbac-fe-button-gates-phase1` (회원·お知らせ·권한관리)
>   - PR-2: `feature/rbac-fe-button-gates-phase2` (대량메일·카테고리·메뉴·코드 + 페이지 가드 보강)
> **Predecessors**:
>   - PR #72 — RBAC 시드 + `/auth/me/permissions` (2026-04-22 머지)
>   - `feature/rbac-enforcement-phase2` — BE 가드 핵심 4개 도메인 + 13개 후속 라우트 확산 (머지 완료)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | BE 가드(`requireMenuPermission`)는 핵심 admin 도메인 전부에 적용 완료, 페이지 진입 가드(`requirePageMenuPermission`)도 13개 페이지 적용 완료. 그러나 **admin 7개 도메인의 모든 CUD 버튼이 FE 가드 미적용** → 권한관리 UI 에서 부분 권한(canCreate/canUpdate/canDelete)을 토글해도 admin 화면에서는 버튼이 항상 표시. 클릭 시 BE 403 alert 만 노출되어 UX 결함. |
| **Solution** | 7개 도메인의 모든 등록·수정·삭제·복사·일괄삭제·재발송·sort 등 CUD 액션을 `useMenuPermission(menuCode)` 또는 `<PermissionGate menuCode action>` 로 가드. 단순 미러링 — BE menuCode/action 과 1:1 일치. |
| **Function/UX Effect** | 권한관리 UI 에서 (예) `ADM_MEMBER.update=false` 토글 → 회원관리 화면의 모든 수정 버튼이 즉시 disabled/숨김. BE 403 도달 전 클라이언트에서 명확한 시각 피드백 제공. |
| **Core Value** | 권한 매트릭스를 **실제 운영 가능한 UX 계약**으로 전환. 권한관리 화면이 단순 매트릭스 표시가 아니라 **실효성 있는 운영 콘솔**로 동작. |

---

## 1. Overview

### 1.1 Purpose
Redmine #2183 의 정확한 지적: "권한관리에서 관리되는 CRUD 의 정보를 기반으로 등록·수정·삭제 버튼 제어 적용" 을 admin 7개 도메인 전체에 일괄 적용. **전체 범위 누락 없이 신중 진행** 이 핵심 지침.

### 1.2 Background

**현재 상태 (2026-05-06 기준 코드 검수 결과)**:
- ✅ **인프라 완비**: `requireMenuPermission` (BE), `requirePageMenuPermission` (페이지), `useMenuPermission` / `useMenuPermissionMap` (FE 훅), `<PermissionGate>` (선언 컴포넌트), `GET /api/auth/me/permissions` (응답)
- ✅ **BE API 가드**: 7개 admin 도메인 + CONTENT 적용 완료 (~25 라우트)
- ✅ **페이지 진입 가드**: 13 페이지 적용 (admin 7 + contents 4 + inquiry + mypage)
- ✅ **GNB / 관리탭 가드**: `header.tsx` + `admin-tab.tsx` 가 `useMenuPermissionMap` 으로 메뉴 필터링
- ✅ **콘텐츠 화면 버튼 가드**: `contents-table.tsx` (등록), `contents-detail.tsx` (수정/삭제) 적용 완료
- ❌ **admin 7개 도메인 버튼 가드**: 전부 미적용 — **본 PR 의 핵심 범위**

**메뉴코드 universe (`src/lib/schemas/common.ts:35-42`)**: 18개 (생략, [project_rbac_fe_button_gates.md](../../../...) 참조)

### 1.3 Non-goals

- **mypage MY_* matrix dead 정리**: `MY_PROFILE`/`MY_DOWNLOAD`/`MY_INQUIRY` 가 매트릭스에 정의됐으나 BE 가드 미연결. 본 PR 비대상 (별도 정리 PR)
- **interface-logs 메뉴코드 신설**: `/api/admin/interface-logs` 가 `requireAdmin` 으로만 보호. 본 PR 비대상
- **BE 신규 라우트 추가**: 본 PR 은 FE 전용 — BE 변경 0건 (이미 가드 완비)
- **`<PermissionGate>` vs `useMenuPermission` 통일**: 현재 두 패턴 공존. 본 PR 도 컴포넌트 특성에 맞춰 혼용 (단건 액션 → `useMenuPermission`, 선언적 차단 → `PermissionGate`)
- **권한 변경 시 즉시 UI 반영 (real-time push)**: TanStack Query staleTime 5 분 + `["me", "permissions"]` invalidate 흐름 그대로 사용. 추가 push 도입 비대상
- **HOME menuCode 페이지 가드**: `/` 홈은 본 PR 범위 외 (모든 인증 사용자 노출 의도면 Non-goal)

---

## 2. Scope

### 2.1 In Scope — PR-1 (Phase 1, ~7 files / +250 lines)

#### 2.1.1 회원관리 (`ADM_MEMBER`) — 2 files

- [ ] **`src/components/admin/members/members-table.tsx`**
  - 액션: 행 클릭 → 회원 상세 popup (read 는 페이지 가드로 통과)
  - **가드 대상 없음** (검색/페이지네이션은 read 영역) — *핵심 가드는 popup*
- [ ] **`src/components/popup/member-detail-popup.tsx`**
  - 가드 대상 액션:
    - [ ] 編集 모드 진입 (현재 `MemberEditForm` 자체가 표시되는 조건) — `ADM_MEMBER.update`
    - [ ] 비밀번호 リセット 버튼 — `ADM_MEMBER.update` (별도 reset-password API)
    - [ ] 권한 변경 (userRole SelectBox) → 저장 — `ADM_MEMBER.update`
    - [ ] 활성/비활성 토글 (status) → 저장 — `ADM_MEMBER.update`
    - [ ] 2FA 활성/비활성 토글 → 저장 — `ADM_MEMBER.update`
  - 정책: `canUpdate=false` 인 경우 모든 편집 UI 비표시 (읽기전용 모드 강제)

#### 2.1.2 お知らせ (`ADM_NOTICE`) — 3 files

- [ ] **`src/components/admin/notices/notices-table.tsx`**
  - 가드 대상 버튼:
    - [ ] 上단 「お知らせ登録」 버튼 (line 462) — `ADM_NOTICE.create`
    - [ ] 上단 「削除」 (일괄삭제, line 459) — `ADM_NOTICE.delete`
    - [ ] 행 inline 편집 popup 진입 (line 269) — `ADM_NOTICE.update` (행별 작성자 가드와 AND)
    - [ ] 행 inline 삭제 confirm (line 226) — `ADM_NOTICE.delete`
- [ ] **`src/components/popup/notice-form-popup.tsx`**
  - 가드 대상 버튼:
    - [ ] 「保存」 (등록/수정 공용) — mode 에 따라 `ADM_NOTICE.create` 또는 `ADM_NOTICE.update`
    - [ ] 「削除」 (수정 모드 한정) — `ADM_NOTICE.delete`
    - [ ] 첨부 추가/삭제 — `ADM_NOTICE.update` (저장 액션 일부)

#### 2.1.3 권한관리 (`ADM_PERMISSION`) — 1 file (큰 단일 파일)

- [ ] **`src/components/admin/permissions/permissions-table.tsx`**
  - 가드 대상 버튼/액션:
    - [ ] 「行追加 (新規)」 (line 646) — `ADM_PERMISSION.create`
    - [ ] 「キャンセル (新規 행 취소)」 (line 642) — read 영역 (가드 X)
    - [ ] 「保存」 상단 (단건/일괄, line 650-655) — `ADM_PERMISSION.update` (또는 신규 행이면 create)
    - [ ] Y/N SelectBox 토글 (cellEditor) — `ADM_PERMISSION.update`
    - [ ] 권한코드/권한명/사용여부 inline 편집 — `ADM_PERMISSION.update`
    - [ ] 행 삭제 (DELETE 액션 존재 시) — `ADM_PERMISSION.delete`
  - 특이점: **이 화면 자체가 권한 매트릭스 편집 화면** → SUPER_ADMIN 만 접근 가능 (페이지 진입 가드로 이미 차단)
  - 정책: ADMIN 은 `ADM_PERMISSION.read=true` 만 시드되어 있어 페이지 진입은 가능하나 매트릭스 토글 비활성

### 2.2 In Scope — PR-2 (Phase 2, ~16 files / +400 lines)

#### 2.2.1 대량메일 (`ADM_BULK_MAIL`) — 5 files

- [ ] **`src/components/admin/bulk-mail/bulk-mail-table.tsx`**
  - 가드 대상 버튼:
    - [ ] 「メール作成」 / 「新規」 등록 버튼 — `ADM_BULK_MAIL.create`
    - [ ] 행 inline 「コピー」 (복사 후 새 등록 페이지) — `ADM_BULK_MAIL.create`
    - [ ] 행 inline 「削除」 — `ADM_BULK_MAIL.delete`
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form.tsx`**
  - 가드 대상 버튼:
    - [ ] 「下書き保存」 — mode 에 따라 create/update
    - [ ] 「送信」 / 「再送信」 — `ADM_BULK_MAIL.update`
    - [ ] 「削除」 (편집 모드) — `ADM_BULK_MAIL.delete`
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-info.tsx`**
  - 가드 대상: 입력 필드 `disabled` (수정 모드 + canUpdate=false)
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-targets.tsx`**
  - 가드 대상: 게시대상 선택 disabled
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-attachment.tsx`**
  - 가드 대상: 첨부 추가/삭제 버튼 disabled
- [ ] **(선택)** `src/app/admin/bulk-mail/create/page.tsx` — 페이지 진입 가드 (`requirePageMenuPermission("ADM_BULK_MAIL", "create")`) **추가 필요** — 현재 `"use client"` 라 서버 가드 미적용
- [ ] **(선택)** `src/app/admin/bulk-mail/[id]/page.tsx` — 페이지 진입 가드 추가 필요 (read)

#### 2.2.2 카테고리 (`ADM_CATEGORY`) — 3 files

- [ ] **`src/components/admin/categories/categories-tree.tsx`**
  - 가드 대상 버튼/액션:
    - [ ] 신규 카테고리 추가 (트리 추가) — `ADM_CATEGORY.create`
    - [ ] 트리 노드 컨텍스트 메뉴 (편집/삭제) — `ADM_CATEGORY.update` / `delete`
    - [ ] 드래그앤드롭 sort — `ADM_CATEGORY.update`
- [ ] **`src/components/admin/categories/categories-detail.tsx`**
  - 가드 대상 버튼:
    - [ ] 「保存」 (등록/수정 공용) — mode 에 따라 create/update
    - [ ] 「削除」 (cascade-preview 트리거) — `ADM_CATEGORY.delete`
- [ ] **`src/components/admin/categories/use-category-mutations.ts`**
  - 가드 대상: mutation 함수 자체는 권한과 무관 (read-only hook)
  - 권한은 호출처(tree/detail) 에서 차단

#### 2.2.3 메뉴관리 (`ADM_MENU`) — 3 files

- [ ] **`src/components/admin/menus/menus-tables.tsx`**
  - 가드 대상 버튼:
    - [ ] 신규 메뉴 추가 — `ADM_MENU.create`
    - [ ] 행별 편집/삭제 — `ADM_MENU.update` / `delete`
    - [ ] sort 변경 — `ADM_MENU.update`
- [ ] **`src/components/admin/menus/menus-info-form.tsx`**
  - 가드 대상 버튼:
    - [ ] 「保存」 — mode 에 따라 create/update
    - [ ] 「削除」 — `ADM_MENU.delete`
    - [ ] 활성/비활성 토글 — `ADM_MENU.update`
- [ ] **`src/components/admin/menus/menus-contents.tsx`**
  - 가드 대상: 컨테이너 — 하위 컴포넌트에 권한 prop drilling 또는 자체 훅 호출

#### 2.2.4 코드관리 (`ADM_CODE`) — 3 files

- [ ] **`src/components/admin/codes/codes-header-table.tsx`**
  - 가드 대상 버튼:
    - [ ] 헤더 신규 추가 — `ADM_CODE.create`
    - [ ] 헤더 inline 편집 — `ADM_CODE.update`
    - [ ] 헤더 삭제 — `ADM_CODE.delete`
    - [ ] 활성/비활성 토글 — `ADM_CODE.update`
- [ ] **`src/components/admin/codes/codes-detail-table.tsx`**
  - 가드 대상 버튼:
    - [ ] 디테일 신규 추가 — `ADM_CODE.create`
    - [ ] 디테일 inline 편집 — `ADM_CODE.update`
    - [ ] 디테일 삭제 — `ADM_CODE.delete`
    - [ ] sort 변경 — `ADM_CODE.update`
- [ ] **`src/components/admin/codes/codes-contents.tsx`**
  - 가드 대상: 컨테이너 — 하위 컴포넌트에 권한 전달

#### 2.2.5 페이지 진입 가드 보강 — 2 files

- [ ] **`src/app/admin/bulk-mail/create/page.tsx`**: 현재 `"use client"` 페이지로 서버 가드 미적용 → server wrapper 분리 후 `requirePageMenuPermission("ADM_BULK_MAIL", "create", { fallback: "/admin/bulk-mail" })` 추가
- [ ] **`src/app/admin/bulk-mail/[id]/page.tsx`**: 동상 → `requirePageMenuPermission("ADM_BULK_MAIL", "read")` 추가

### 2.3 누락 방지 체크리스트 (각 PR 머지 전 필수 검증)

각 도메인별로 모두 확인:
- [ ] 모든 등록 버튼에 `canCreate` 가드 적용
- [ ] 모든 수정 버튼/inline 편집에 `canUpdate` 가드 적용
- [ ] 모든 삭제 버튼 (단건 + 일괄) 에 `canDelete` 가드 적용
- [ ] ag-grid `cellRenderer` 내부의 액션 아이콘/버튼도 가드 적용
- [ ] 컨텍스트 메뉴, 우클릭 액션, 드래그앤드롭 트리거도 가드 적용
- [ ] 모달/popup 내부의 등록/수정/삭제 버튼도 가드 적용 (member-detail, notice-form 등)
- [ ] 폼 입력 필드도 `disabled` 처리 (canUpdate=false 시)
- [ ] BE API 가드의 `menuCode/action` 과 FE 가드 인자가 1:1 일치
- [ ] 로딩 중 정책 일관: 단건 액션은 `PermissionGate` (fail-closed) / 컨테이너 필터는 `useMenuPermissionMap.has()` (permissive)
- [ ] read-only 모드에서 화면 자체가 깨지지 않는지 (등록/수정 버튼 숨김 후 레이아웃 검증)

### 2.4 Out of Scope (별도 PR / 후속)

- mypage `MY_*` matrix dead 정리 (Priority 3)
- `interface-logs` 메뉴코드 신설 + `/api/admin/interface-logs` BE 가드 교체 (Priority 3)
- `/api/menus`·`/api/roles` GET 의 자체 분기 vs `requireMenuPermission` 일관성 정리 (Priority 4)
- `/api/mypage/*` 에 `requireMenuPermission` 적용 (Priority 4)
- HOME menuCode 페이지 가드 (홈 공개 정책 합의 후)
- 권한 변경 push (real-time invalidate) — TanStack staleTime 5 분 정책 유지

---

## 3. Requirements

| ID | Requirement | Priority | 근거 |
|----|-------------|:--------:|------|
| FR-01 | 7개 admin 도메인의 모든 CUD 버튼/액션이 `useMenuPermission` 또는 `<PermissionGate>` 로 가드 | High | Redmine #2183 본 이슈 |
| FR-02 | FE 가드의 `menuCode/action` 인자가 BE `requireMenuPermission` 의 인자와 1:1 일치 | High | divergence 방지 |
| FR-03 | 단건 CUD 액션 가드는 `<PermissionGate>` 또는 `useMenuPermission` (로딩 중 fail-closed) — 클릭 race window 차단 | High | 보안 일관성 |
| FR-04 | 컨테이너/메뉴 필터는 `useMenuPermissionMap.has()` (로딩 중 permissive) — 네비 골격 보존 | Medium | UX 보존 |
| FR-05 | `canUpdate=false` 인 경우 폼 입력 필드도 `disabled` 처리 (저장 버튼만 숨기는 부분 적용 금지) | Medium | UX 일관성 |
| FR-06 | `member-detail-popup.tsx` 의 편집 모드는 `canUpdate=false` 시 readonly 모드로 강제 (편집 폼 자체 비표시) | Medium | 기존 PR #147 패턴 미러링 |
| FR-07 | bulk-mail/create/[id] 페이지에 서버 진입 가드 추가 (`requirePageMenuPermission`) | Medium | 페이지 직진입 차단 + GET race 회피 |
| NFR-01 | 변경 후 SUPER_ADMIN UX 동작 동일 (regression 0) | High | 운영 관리자 안전 |
| NFR-02 | 변경 후 ADMIN UX 동작 동일 — 매트릭스가 모든 ADM_* CUD 허용이므로 기본 시드 기준 변화 없음 | High | UX 보존 |
| NFR-03 | 권한관리 UI 토글 → 5 분 staleTime 후 또는 mutation invalidate 시 권한 화면 즉시 반영 | High | 매트릭스 실효성 |
| NFR-04 | 변경 라인 외 기존 동작 회귀 0 (검색/페이지네이션/정렬/필터) | High | 안정성 |

---

## 4. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|:------:|:-----------:|------------|
| **R1**: 누락된 버튼이 1개라도 있으면 매트릭스 토글이 부분 효력만 발휘 → "잘 동작하는 줄 알았는데 어딘가 통과되더라" 회귀 | High | High | §2.3 누락 방지 체크리스트 — 각 도메인별 PR 머지 전 사용자/리뷰어 점검. ag-grid cellRenderer 내부 검수 강제 |
| **R2**: `useMenuPermission` 의 로딩 중 정책(`PermissionGate` fail-closed) 이 첫 진입에 버튼 깜빡임 유발 | Medium | Medium | 기존 콘텐츠 화면 패턴(`isPermLoading` 분기) 미러링. 로딩 중 disabled 후 fetch 완료 시 활성/비활성 결정 |
| **R3**: ADMIN 의 기본 매트릭스가 시드에서 ADM_* CUD 모두 허용이라 회귀 미체감 → 부분 권한 토글 시점에야 결함 발견 | Medium | High | 검증 단계에서 임시 role 생성(예: `READONLY_ADMIN`) 후 canUpdate=false 시드 적용해 모든 화면 시각 검증 |
| **R4**: PR-1 머지 후 PR-2 작업 중 main(`development`) 충돌 발생 | Low | Medium | PR-1 머지 직후 `feature/rbac-fe-button-gates-phase2` 를 development 와 sync. 컴포넌트 분리되어 있어 실 충돌 가능성 낮음 |
| **R5**: bulk-mail 폼이 `"use client"` 라 페이지 가드 추가 시 server/client 경계 변경 필요 | Medium | Medium | server wrapper page → client form 컴포넌트 패턴으로 분리. `/admin/bulk-mail/create/page.tsx` 를 server 로 변경하고 form 은 별도 client 컴포넌트로 import |
| **R6**: 권한관리 화면에서 ADM_PERMISSION.update=false 인 ADMIN 이 매트릭스를 readonly 로 보게 되는 UX 적정성 | Low | Medium | PR #72 시드 정책상 의도된 동작 (ADMIN 은 ADM_PERMISSION.read 만 true). 추가 안내 문구 불요 |

---

## 5. Test Plan (Plan 단계 기준 — 상세는 Design 문서)

### 5.1 도메인별 시나리오 매트릭스

각 도메인 × 4개 role (SUPER_ADMIN / ADMIN / 부분권한 신규 role / 일반 1ST_STORE) × 4 액션 (read/create/update/delete):

- [ ] **회원관리**: SUPER_ADMIN 모든 버튼 노출 / ADMIN 모든 버튼 노출 / READONLY_ADMIN 편집 폼 readonly + 비번리셋 숨김 / 1ST_STORE 진입 차단(페이지 가드)
- [ ] **お知らせ**: 上 동일 패턴
- [ ] **권한관리**: SUPER_ADMIN 매트릭스 편집 가능 / ADMIN 매트릭스 readonly / 그 외 진입 차단
- [ ] **대량메일**: SUPER_ADMIN/ADMIN 모든 버튼 / READONLY_ADMIN 등록·수정·삭제·재발송 모두 비활성 / 1ST_STORE 진입 차단
- [ ] **카테고리**: 上 동일 + 트리 드래그 비활성 검증
- [ ] **메뉴관리**: SUPER_ADMIN 만 풀가이드 / ADMIN ADM_MENU.create=false 시드 → 등록 비활성 검증
- [ ] **코드관리**: 上 동일 + header/detail 양쪽 검증

### 5.2 회귀 검증

- [ ] 콘텐츠 화면(`contents-table`, `contents-detail`) 의 기존 가드 동작 변화 없음
- [ ] GNB / 관리탭 메뉴 필터 동작 변화 없음
- [ ] BE API 응답 변화 없음 (FE only PR)
- [ ] 로딩 중 깜빡임 측정 (콘텐츠 패턴 미러링 했는지 시각 확인)

### 5.3 Zero Script QA

- [ ] dev 서버에서 임시 role 시드 + 사용자 매핑 후 모든 도메인 화면 진입
- [ ] 7개 도메인 × 부분권한 시나리오 = 28 케이스 시각 검증
- [ ] BE 403 alert 가 발생하지 않는지 (FE 가드가 클릭 자체를 차단하는지) 확인

---

## 6. Dependencies

| Dependency | Status |
|------------|:------:|
| BE `requireMenuPermission` 7개 도메인 적용 | ✅ 완료 |
| 페이지 가드 `requirePageMenuPermission` 13개 페이지 적용 | ✅ 완료 (bulk-mail create/[id] 만 누락 — 본 PR 에서 보강) |
| `GET /api/auth/me/permissions` 응답 매트릭스 | ✅ 완료 |
| FE `useMenuPermission` / `useMenuPermissionMap` / `<PermissionGate>` 훅 + 컴포넌트 | ✅ 완료 |
| PR #147 머지 (메일·권한관리·회원관리 mutation) | ✅ 완료 (2026-05-04) |

**선결 조건**: PR-1 머지 후 PR-2 시작 (충돌 회피). 단 PR-2 의 도메인은 PR-1 과 컴포넌트가 겹치지 않으므로 평행 진행도 가능 (사용자 결정 사항).

---

## 7. Related Documents

- **Redmine**: [#2183](http://gw.interplug.co.kr:43333/issues/2183)
- **Memory**: `project_rbac_fe_button_gates.md` (작업자 로컬 자동 메모리, Redmine #2183 참조)
- **선행 Plan**: [rbac-enforcement-phase2.plan.md](./rbac-enforcement-phase2.plan.md) (BE Phase 2)
- **Design Doc (짝)**: [rbac-fe-button-gates.design.md](../../02-design/features/rbac-fe-button-gates.design.md) — `/pdca design` 단계에서 작성 예정
- **검수 보고**: 2026-05-06 세션 검수 결과 (이 Plan 의 §1.2 Background 와 §2.1~2.4 의 In Scope 가 검수 결과의 "권한 누락된 부분 — Priority 1" 과 1:1 대응)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-06 | Initial draft — Redmine #2183 옵션 B (2 PR 분할), 7 도메인 23 파일, 누락 방지 체크리스트 | CK |
