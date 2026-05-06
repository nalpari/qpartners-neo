# RBAC FE Button Gates — Phase 2 Planning Document

> **Summary**: PR-1 (회원·お知らせ·권한관리, 머지 완료)에 이은 Phase 2. admin 4개 도메인(대량메일·카테고리·메뉴관리·코드관리) + 페이지 진입 가드 보강. PR-1 에서 검증된 패턴 A/B/C/E 미러링.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-06
> **Status**: Draft
> **Redmine**: [#2183 — [공통] 권한관리에서 관리되는 CRUD 의 정보를 기반으로 등록·수정·삭제 버튼 제어 적용](http://gw.interplug.co.kr:43333/issues/2183)
> **Branch**: `feature/rbac-fe-button-gates-phase2`
> **Predecessors**:
>   - PR #72 — RBAC 시드 + `/auth/me/permissions` (2026-04-22 머지)
>   - `feature/rbac-enforcement-phase2` — BE 가드 13개 후속 라우트 확산 (머지 완료)
>   - **PR #148** — `feature/rbac-fe-button-gates-phase1` (회원·お知らせ·권한관리 + 콘텐츠 보강, 2026-05-06 머지 완료)
> **Sibling Plan**: [rbac-fe-button-gates.plan.md](./rbac-fe-button-gates.plan.md) — 통합 Plan (PR-1+PR-2 범위 정의)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | PR-1 머지로 회원·お知らせ·권한관리는 FE 버튼 가드 완료. 그러나 **4개 admin 도메인(대량메일/카테고리/메뉴/코드)의 모든 CUD 버튼은 여전히 FE 가드 미적용**. BE 가드는 모든 도메인에 적용 완료(`requireMenuPermission`)되어 있으므로 FE 만 보강하면 매트릭스 토글 즉시 반영이 7개 도메인 전 영역에서 일관 동작. |
| **Solution** | 4개 도메인의 등록·수정·삭제·복사·일괄삭제·sort·드래그앤드롭 등 CUD 액션을 PR-1 에서 검증된 4개 패턴(A=PermissionGate / B=disabled / C=readonly form / E=핸들러 본체 가드)으로 가드. BE menuCode/action 과 1:1 일치. **bulk-mail create/[id] 페이지 진입 가드 보강 동시 처리**. |
| **Function/UX Effect** | 권한관리 UI 에서 (예) `ADM_BULK_MAIL.update=false` 토글 → 대량메일 화면의 등록/송신/재송신 버튼 즉시 disabled. PR-1 과 동일한 UX 일관성 7개 도메인 전체에 확보. |
| **Core Value** | Redmine #2183 의 admin 도메인 전 범위 종결. 권한관리 매트릭스가 **운영 콘솔의 단일 진실 소스**로 완성. |

---

## 1. Overview

### 1.1 Purpose

PR-1 에서 검증된 RBAC 가드 4개 패턴을 잔여 4개 admin 도메인에 일괄 미러링. **전체 범위 누락 없이 신중 진행** 이 핵심 지침([project_rbac_fe_button_gates.md](../../../) 메모리). PR-1 머지 후 development 와 sync 한 상태에서 시작.

### 1.2 Background

#### PR-1 검증된 자산 (재사용)

| 패턴 | 용도 | 대표 적용처 (PR #148) |
|------|------|-----------------------|
| **A — `<PermissionGate>`** | 단건 등록 버튼 등 선언적 차단 | `notices-table.tsx` 「お知らせ登録」 |
| **B — `disabled={isPermLoading \|\| !canX}`** | 일괄 액션·상단 액션 버튼 | `notices-table.tsx` 일괄삭제 |
| **C — readonly form** | 편집 폼 자체 비표시 (canUpdate=false) | `member-detail-popup.tsx` MemberEditForm |
| **E — 핸들러 본체 가드** | mutate 호출 직전 재검증 (`if (isPermLoading) return; if (!canX) { alert; return; }`) | `permission-menu-popup.tsx`, `notices-table.tsx`, `notice-form-popup.tsx`, `permissions-table.tsx` |

추가로 PR-1 에서 정착된 정책:
- **로딩 중 silent return** — `if (isPermLoading) return;` (다른 핸들러와 정책 통일, BC 리뷰 MEDIUM-4 반영)
- **부모 단일 호출 → prop 전달** — `useMenuPermission` 부모/자식 중복 호출 금지 (BC 리뷰 MEDIUM-2 반영)
- **RBAC 가드 선행 평가** — `if (isPermLoading || !canX || !ownerCheck(...))` (BC 리뷰 MEDIUM-1 반영)

#### 현재 상태 (2026-05-06 코드 검수)

- ✅ **BE API 가드**: 4개 도메인 전부 적용 완료 (`/api/categories`, `/api/menus`, `/api/codes`, `/api/bulk-mail`)
- ✅ **페이지 진입 가드**: `/admin/categories`, `/admin/menus`, `/admin/codes`, `/admin/bulk-mail` (목록) 적용 완료
- ❌ **bulk-mail create/[id] 페이지 진입 가드**: `"use client"` 페이지로 서버 가드 미적용 (PR-2 보강)
- ❌ **4개 도메인 FE 버튼 가드**: 전부 미적용 — **본 PR 의 핵심 범위**

### 1.3 Non-goals

- mypage `MY_*` matrix dead 정리 (Priority 3, 별도 PR)
- `interface-logs` 메뉴코드 신설 (Priority 3, 별도 PR)
- `/api/menus`·`/api/roles` GET 자체 분기 vs `requireMenuPermission` 일관성 정리 (Priority 4)
- BE 신규 라우트 추가 (FE only PR — BE 변경 0건)
- TargetType enum → ContentTarget.roleCode FK 동적화 (별도 PR, [project_target_dynamic_from_role.md](../../../) 메모리 참조)
- `<PermissionGate>` vs `useMenuPermission` 패턴 통일 — 컴포넌트 특성에 맞춰 혼용 유지 (PR-1 기조)

---

## 2. Scope

### 2.1 In Scope — 4개 도메인 (~14 files / +320 lines 예상)

#### 2.1.1 대량메일 (`ADM_BULK_MAIL`) — 6 files

- [ ] **`src/components/admin/bulk-mail/bulk-mail-table.tsx`** (line 166 「メール作成」)
  - [ ] 「メール作成」 등록 버튼 — 패턴 A (`<PermissionGate menuCode="ADM_BULK_MAIL" action="create">`)
  - [ ] 행 inline 「コピー」 (있는 경우) — 패턴 A 또는 B (create 액션)
  - [ ] 행 inline 「削除」 (있는 경우) — 패턴 B + 패턴 E (`ADM_BULK_MAIL.delete`)
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form.tsx`** (line 285 「削除」, 289 「送信」, 292 「下書き保存」)
  - [ ] 「送信」 / 「再送信」 — 패턴 B + 패턴 E (mode=create → create / mode=edit → update)
  - [ ] 「下書き保存」 — 패턴 B + 패턴 E (mode=create → create / mode=edit → update)
  - [ ] 「削除」 (편집 모드) — 패턴 B + 패턴 E (`ADM_BULK_MAIL.delete`)
  - 정책: useMenuPermission 부모(form) 단일 호출 후 자식(form-info/targets/attachment) prop 주입
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-info.tsx`**
  - [ ] 입력 필드 `disabled` (canUpdate=false 시) — prop drilling 으로 부모에서 권한 주입
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-targets.tsx`**
  - [ ] 게시대상 SelectBox 등 disabled — 동일
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-attachment.tsx`**
  - [ ] 첨부 추가/삭제 버튼 disabled — 동일
- [ ] **`src/components/admin/bulk-mail/form/bulk-mail-form-content.tsx`** *(rich-editor 포함, 검수 필요)*
  - [ ] rich-editor readonly 모드 — `canUpdate=false` 시 편집 차단

#### 2.1.2 카테고리 (`ADM_CATEGORY`) — 3 files

- [ ] **`src/components/admin/categories/categories-tree.tsx`**
  - [ ] 트리 노드 클릭(선택) — read 영역, 가드 X
  - [ ] 트리 신규 추가 / 컨텍스트 메뉴 (있는 경우) — 패턴 A 또는 B (create/update/delete)
  - [ ] 드래그앤드롭 sort (있는 경우) — 패턴 E (`onDragEnd` 핸들러 본체 가드, `ADM_CATEGORY.update`)
- [ ] **`src/components/admin/categories/categories-detail.tsx`** (line 103 「削除」, 113 「新規」, 116 「保存」)
  - [ ] 「保存」 — 패턴 B + 패턴 E (mode=create → create / mode=edit → update)
  - [ ] 「削除」 (cascade-preview 트리거) — 패턴 B + 패턴 E (`ADM_CATEGORY.delete`)
  - [ ] 「新規」 — 패턴 A 또는 B (`ADM_CATEGORY.create`)
- [ ] **`src/components/admin/categories/categories-contents.tsx`** (line 131 createMutation, 140 updateMutation, 199 deleteMutation)
  - [ ] 컨테이너에서 `useMenuPermission(ADM_CATEGORY)` 단일 호출 후 자식(tree/detail) prop 주입
  - [ ] mutation 호출 직전 패턴 E 재검증

#### 2.1.3 메뉴관리 (`ADM_MENU`) — 3 files

- [ ] **`src/components/admin/menus/menus-tables.tsx`** (line 282 「ソート保存」)
  - [ ] 행 클릭 — read 영역
  - [ ] 「ソート保存」 — 패턴 B + 패턴 E (`ADM_MENU.update`)
- [ ] **`src/components/admin/menus/menus-info-form.tsx`** (line 90 「新規」, 97 「削除」, 104 「保存」)
  - [ ] 「新規」 — 패턴 A 또는 B (`ADM_MENU.create`)
  - [ ] 「保存」 — 패턴 B + 패턴 E (mode=create → create / mode=edit → update)
  - [ ] 「削除」 — 패턴 B + 패턴 E (`ADM_MENU.delete`)
- [ ] **`src/components/admin/menus/menus-contents.tsx`** (line 79/103/134 mutations, 290 sortMutation)
  - [ ] 컨테이너에서 `useMenuPermission(ADM_MENU)` 단일 호출 후 자식 prop 주입
  - [ ] sortMutation 도 update 액션 가드

#### 2.1.4 코드관리 (`ADM_CODE`) — 2 files

- [ ] **`src/components/admin/codes/codes-header-table.tsx`** (line 333 「キャンセル」, 335 「追加」, 337 「保存」)
  - [ ] 「追加」 (인라인 추가) — 패턴 B (`ADM_CODE.create`)
  - [ ] 「保存」 (단건/일괄) — 패턴 B + 패턴 E (신규 행 → create / 기존 행 → update)
  - [ ] inline 편집/Y-N 토글 — 패턴 E (`ADM_CODE.update`)
  - [ ] 행 삭제 (있는 경우) — 패턴 B + 패턴 E (`ADM_CODE.delete`)
- [ ] **`src/components/admin/codes/codes-detail-table.tsx`** (line 299 「キャンセル」, 301 「追加」)
  - [ ] 「追加」 — 패턴 B (`ADM_CODE.create`)
  - [ ] inline 편집 — 패턴 E (`ADM_CODE.update`)
  - [ ] 행 삭제 — 패턴 B + 패턴 E (`ADM_CODE.delete`)
  - [ ] sort 변경 (있는 경우) — 패턴 E (`ADM_CODE.update`)
- [ ] **(선택)** `src/components/admin/codes/codes-contents.tsx`
  - 컨테이너 단일 호출 패턴 적용 여부는 코드 구조에 따라 결정 (헤더/디테일이 분리된 경우 각자 호출 가능)

### 2.2 In Scope — 페이지 진입 가드 보강 (~2 files / +30 lines)

- [ ] **`src/app/admin/bulk-mail/create/page.tsx`** — `"use client"` 페이지 → server wrapper 분리
  - server `page.tsx`: `requirePageMenuPermission("ADM_BULK_MAIL", "create", { fallback: "/admin/bulk-mail" })`
  - client `bulk-mail-create-client.tsx` (또는 동등): 기존 form 렌더링
- [ ] **`src/app/admin/bulk-mail/[id]/page.tsx`** — 동일 패턴
  - server `page.tsx`: `requirePageMenuPermission("ADM_BULK_MAIL", "read")`
  - client 컴포넌트로 form 렌더링 분리

**선택 사항**: `read` 액션은 페이지 가드만으로 충분하므로 form 자체 read-level 가드는 불요.

### 2.3 누락 방지 체크리스트 (머지 전 필수 검증)

PR-1 머지 전 체크리스트에 추가된 항목 포함:

- [ ] 4개 도메인의 모든 CUD 버튼/액션이 패턴 A/B/C/E 중 하나로 가드
- [ ] ag-grid `cellRenderer` 내부의 액션 아이콘/버튼도 가드 적용
- [ ] 컨텍스트 메뉴, 우클릭 액션, 드래그앤드롭(`onDragEnd`) 트리거도 가드 적용
- [ ] 모달/popup 내부의 등록/수정/삭제 버튼도 가드 적용
- [ ] 폼 입력 필드도 `disabled` 처리 (canUpdate=false 시) — bulk-mail form 4개 자식 컴포넌트
- [ ] BE API 가드의 `menuCode/action` 과 FE 가드 인자가 1:1 일치 (§3 매핑표)
- [ ] **부모/자식 `useMenuPermission` 중복 호출 금지** (PR-1 BC 리뷰 MEDIUM-2 학습)
- [ ] **로딩 중 silent return** (`if (isPermLoading) return;`) — alert 노출 금지 (PR-1 BC 리뷰 MEDIUM-4 학습)
- [ ] **RBAC 가드 선행 평가** — `if (isPermLoading || !canX || !ownerCheck())` (PR-1 BC 리뷰 MEDIUM-1 학습)
- [ ] read-only 모드에서 화면 자체가 깨지지 않는지 (등록/수정 버튼 숨김 후 레이아웃 검증)
- [ ] bulk-mail create/[id] 페이지 server wrapper 분리 후 client form 정상 동작 확인

### 2.4 Out of Scope (별도 PR / 후속)

- mypage `MY_*` matrix dead 정리 (Priority 3)
- `interface-logs` 메뉴코드 신설 (Priority 3)
- `/api/menus`·`/api/roles` GET 자체 분기 vs `requireMenuPermission` 일관성 정리 (Priority 4)
- TargetType enum → ContentTarget.roleCode FK 동적화 ([project_target_dynamic_from_role.md](../../../) 메모리)
- 권한 변경 push (real-time invalidate) — TanStack staleTime 5 분 정책 유지

---

## 3. BE menuCode/action ↔ FE 가드 매핑표 (FR-02 검증용)

| 도메인 | BE 라우트 / 메서드 | menuCode | action | FE 가드 위치 |
|--------|-------------------|----------|--------|-------------|
| **bulk-mail** | `POST /api/bulk-mail` | `ADM_BULK_MAIL` | `create` | `bulk-mail-form.tsx:handleSend` (mode=create) |
| | `PUT /api/bulk-mail/[id]` | `ADM_BULK_MAIL` | `update` | `bulk-mail-form.tsx:handleSend/handleDraft` (mode=edit) |
| | `DELETE /api/bulk-mail/[id]` | `ADM_BULK_MAIL` | `delete` | `bulk-mail-form.tsx:handleDelete` |
| **categories** | `POST /api/categories` (line 56) | `ADM_CATEGORY` | `create` | `categories-detail.tsx:onSave` (mode=create) |
| | `PATCH /api/categories/[id]` (line 21) | `ADM_CATEGORY` | `update` | `categories-detail.tsx:onSave` (mode=edit) |
| | `DELETE /api/categories/[id]` (line 163) | `ADM_CATEGORY` | `delete` | `categories-detail.tsx:onDelete` |
| | `GET /api/categories/[id]/cascade-preview` (line 19) | `ADM_CATEGORY` | `delete` | (delete 트리거 직전 호출, 동일 가드 적용) |
| **menus** | `PATCH /api/menus/[id]` (line 15) | `ADM_MENU` | `update` | `menus-info-form.tsx:onSave` (mode=edit) |
| | `DELETE /api/menus/[id]` (line 87) | `ADM_MENU` | `delete` | `menus-info-form.tsx:onDelete` |
| | `POST /api/menus/sort` (line 13) | `ADM_MENU` | `update` | `menus-tables.tsx:onSortSave` |
| | `POST /api/menus` (있는 경우) | `ADM_MENU` | `create` | `menus-contents.tsx:createMutation` |
| **codes** | `POST /api/codes` (line 48) | `ADM_CODE` | `create` | `codes-header-table.tsx:onAdd/onSave` (신규 행) |
| | `PATCH /api/codes/[id]` (line 54) | `ADM_CODE` | `update` | `codes-header-table.tsx:onSave` (기존 행) |
| | `POST /api/codes/[id]/details` (line 65) | `ADM_CODE` | `create` | `codes-detail-table.tsx:onAdd/onSave` |
| | `PATCH /api/codes/[id]/details/[detailId]` (line 21) | `ADM_CODE` | `update` | `codes-detail-table.tsx:onSave` |
| | `DELETE /api/codes/[id]/details/[detailId]` (line 168) | `ADM_CODE` | `delete` | `codes-detail-table.tsx:onDelete` |

---

## 4. Requirements

| ID | Requirement | Priority | 근거 |
|----|-------------|:--------:|------|
| FR-01 | 4개 admin 도메인의 모든 CUD 버튼/액션이 PR-1 패턴 A/B/C/E 중 하나로 가드 | High | Redmine #2183 본 이슈 |
| FR-02 | FE 가드의 `menuCode/action` 인자가 BE `requireMenuPermission` 의 인자와 1:1 일치 | High | §3 매핑표 |
| FR-03 | 단건 CUD 액션 가드는 `<PermissionGate>` 또는 `useMenuPermission` (로딩 중 fail-closed) — 클릭 race window 차단 + 핸들러 본체 패턴 E 이중 가드 | High | PR-1 BC 리뷰 HIGH-1/HIGH-2 학습 |
| FR-04 | `canUpdate=false` 인 경우 폼 입력 필드도 `disabled` 처리 (저장 버튼만 숨기는 부분 적용 금지) | High | UX 일관성 + bulk-mail 폼 4개 자식 컴포넌트 명시 |
| FR-05 | 부모/자식 `useMenuPermission` 중복 호출 금지 — 부모 단일 호출 + prop drilling | High | PR-1 BC 리뷰 MEDIUM-2 학습 |
| FR-06 | 로딩 중(`isPermLoading`) silent return — alert 노출 금지 | Medium | PR-1 BC 리뷰 MEDIUM-4 학습 |
| FR-07 | RBAC 가드 선행 평가 — `if (isPermLoading || !canX || !ownerCheck())` 순서 | Medium | PR-1 BC 리뷰 MEDIUM-1 학습 |
| FR-08 | bulk-mail create/[id] 페이지에 서버 진입 가드 추가 — server wrapper + client form 분리 | High | 페이지 직진입 차단 + GET race 회피 |
| FR-09 | bulk-mail rich-editor (`bulk-mail-form-content.tsx`) readonly 모드 지원 | Medium | UX 완결성 |
| NFR-01 | SUPER_ADMIN UX 동작 동일 (regression 0) | High | 운영 관리자 안전 |
| NFR-02 | ADMIN 기본 시드 매트릭스(ADM_* CUD 모두 허용) 기준 UX 동작 동일 | High | UX 보존 |
| NFR-03 | 권한관리 UI 토글 → 5 분 staleTime 후 또는 mutation invalidate 시 4개 도메인 화면 즉시 반영 | High | 매트릭스 실효성 |
| NFR-04 | 변경 라인 외 기존 동작 회귀 0 (검색/페이지네이션/정렬/필터/이메일 발송) | High | 안정성 |
| NFR-05 | TypeScript strict, lint·typecheck·build 0 errors | High | 프로젝트 표준 |

---

## 5. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|:------:|:-----------:|------------|
| **R1**: 누락된 버튼이 1개라도 있으면 매트릭스 토글이 부분 효력만 발휘 | High | High | §2.3 누락 방지 체크리스트 + ag-grid cellRenderer 내부 검수 강제. PR-1 에서 체크리스트 통과 후에도 BC 리뷰 HIGH-1/2 가 발견됐던 학습 적용 — 머지 전 `bkit:code-analyzer` 또는 `boston review` 1회 추가 실행 |
| **R2**: bulk-mail 폼이 `"use client"` 라 페이지 가드 추가 시 server/client 경계 변경 필요 | Medium | High | server wrapper page → client form 컴포넌트 패턴으로 분리. 콘텐츠 도메인의 `src/app/contents/[id]/page.tsx` (server) + `contents-detail.tsx` (client) 패턴 미러링 |
| **R3**: rich-editor readonly 모드 미지원 또는 prop 미존재 | Medium | Medium | `src/components/common/rich-editor/rich-editor.tsx` 의 readonly/disabled prop 존재 여부 사전 검증. 미존재 시 `editor.setEditable(!readonly)` 패턴 추가 |
| **R4**: 카테고리 트리 드래그앤드롭이 라이브러리 (예: react-dnd) 라 핸들러 가드 위치 모호 | Low | Medium | `onDragEnd` / `onDrop` 핸들러 본체에 패턴 E 적용. 라이브러리 disabled prop 도 함께 활용 |
| **R5**: 코드관리 inline 편집(cellEditor) 의 키보드 우회 | Medium | High | PR-1 의 `permission-menu-popup.tsx` toggleCell 가드 패턴 미러링 — `onCellValueChanged` / `cellEditorParams` 에 `if (isPermReadOnly) return;` 가드 |
| **R6**: 부모-자식 prop drilling 누락으로 자식 컴포넌트 가드 우회 | Medium | Medium | 자식 컴포넌트 props 인터페이스에 `isPermReadOnly: boolean` 필수 prop 으로 정의, 컴파일 타임 누락 검출 |
| **R7**: development 와 sync 시 PR-1 코드와 충돌 | Low | Low | PR-1 은 다른 도메인이라 충돌 가능성 낮음. 작업 시작 시 development pull → 충돌 즉시 해결 |

---

## 6. Test Plan (Plan 단계 — 상세는 Design 문서)

### 6.1 도메인별 시나리오 매트릭스

각 도메인 × 3개 role (SUPER_ADMIN / READONLY_ADMIN / 일반 1ST_STORE) × 4 액션 (read/create/update/delete):

- [ ] **대량메일**: SUPER_ADMIN 모든 버튼 / READONLY_ADMIN 등록·송신·재송신·삭제 모두 비활성 + 폼 입력 disabled / 1ST_STORE 진입 차단(페이지 가드)
- [ ] **카테고리**: 上 동일 + 트리 드래그 비활성 검증
- [ ] **메뉴관리**: 上 동일 + sort 저장 비활성 검증
- [ ] **코드관리**: 上 동일 + header/detail 양쪽 검증 + inline 편집 키보드 우회 차단

### 6.2 회귀 검증

- [ ] PR-1 도메인(회원·お知らせ·권한관리·콘텐츠) 동작 변화 없음
- [ ] GNB / 관리탭 메뉴 필터 동작 변화 없음
- [ ] BE API 응답 변화 없음 (FE only PR)
- [ ] bulk-mail 메일 발송 기능 정상 동작 (server wrapper 분리 후)
- [ ] 카테고리 cascade-preview 정상 동작
- [ ] 코드관리 inline 편집 + sort 정상 동작

### 6.3 Zero Script QA

- [ ] dev 서버에서 임시 role 시드(`READONLY_ADMIN` — 4개 도메인 CUD=false, read=true) + 사용자 매핑
- [ ] 4개 도메인 × 3개 role 시나리오 = 12 케이스 시각 검증
- [ ] BE 403 alert 가 발생하지 않는지 (FE 가드가 클릭 자체를 차단하는지) 확인
- [ ] inline 편집 cellEditor 키보드 진입(Enter/F2) 가드 확인

---

## 7. Dependencies

| Dependency | Status |
|------------|:------:|
| BE `requireMenuPermission` 4개 도메인 적용 | ✅ 완료 (§3 매핑표 검증) |
| 페이지 가드 — `/admin/bulk-mail`, `/admin/categories`, `/admin/menus`, `/admin/codes` 목록 | ✅ 완료 |
| 페이지 가드 — `/admin/bulk-mail/create`, `/admin/bulk-mail/[id]` | ❌ **본 PR 에서 보강** |
| `GET /api/auth/me/permissions` 응답 매트릭스 | ✅ 완료 |
| FE `useMenuPermission` / `useMenuPermissionMap` / `<PermissionGate>` 훅 + 컴포넌트 | ✅ 완료 |
| **PR #148 머지 (PR-1)** | ✅ 완료 (2026-05-06) |

**선결 조건**: 작업 시작 시 `feature/rbac-fe-button-gates-phase2` 가 development 와 sync 되어야 함.

---

## 8. Implementation Order (제안)

PR-1 학습 — 한 도메인을 완전히 끝내고 다음으로 이동(컨텍스트 스위칭 비용 절감):

1. **카테고리** (3 files, 가장 단순한 구조 — 트리 1개 + 폼 1개)
2. **메뉴관리** (3 files, 카테고리와 유사한 트리 + 폼)
3. **코드관리** (2~3 files, inline 편집 케이스 — PR-1 permission-menu-popup 토글 가드 패턴 직접 미러링)
4. **대량메일** (6 files + 페이지 가드 2 files, 가장 복잡 — 폼 4개 자식 + rich-editor + server wrapper 분리)

각 도메인 완료 시점에 lint/typecheck 통과 확인.

---

## 9. Related Documents

- **선행 PR**: [PR #148](https://github.com/nalpari/qpartners-neo/pull/148) (머지 완료, 2026-05-06)
- **통합 Plan**: [rbac-fe-button-gates.plan.md](./rbac-fe-button-gates.plan.md) (PR-1+PR-2 통합 정의)
- **선행 BE Design**: [rbac-enforcement-phase2.design.md](../../02-design/features/rbac-enforcement-phase2.design.md)
- **PR-1 Design**: [rbac-fe-button-gates.design.md](../../02-design/features/rbac-fe-button-gates.design.md)
- **Redmine**: [#2183](http://gw.interplug.co.kr:43333/issues/2183)
- **Memory**: `project_rbac_fe_button_gates.md` (작업자 로컬 자동 메모리, 옵션 B 분할 + 누락 방지 체크리스트)
- **Reference 컴포넌트**: PR-1 머지된 `notices-table.tsx` / `notice-form-popup.tsx` / `permission-menu-popup.tsx` / `member-detail-popup.tsx` / `permissions-table.tsx` (적용 패턴 모범 사례)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 (Draft) | 2026-05-06 | Initial draft. PR-1 (PR #148) 머지 후 PR-2 범위 분리. PR-1 BC 리뷰 학습(HIGH-1/2 + MEDIUM-1/2/4) 을 §2.3 체크리스트와 §4 FR-05~07 에 반영 | CK |
