# Target Dynamic from Role — Planning Document

> **Summary**: 게시대상/수신대상 옵션을 schema 잠금(`enum TargetType` + `boolean 6개 컬럼` + `enum RecipientAuthRole`)에서 `qp_roles` 기반 동적 옵션으로 전환. 권한관리 = **단일 진실 원천(Single Source of Truth)** 정합성 회복. 4개 화면 (콘텐츠/홈공지/대량메일/회원관리) 모두 동등 처리.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-07
> **Status**: Implemented v0.2 (2026-05-07 — schema/migration + BE + FE + OpenAPI 적용 완료, lint·typecheck·build 0 errors)
> **Redmine**: TBD (이슈 신규 생성 예정 — 제목 후보: "[공통] 권한관리 추가 권한이 4개 화면 게시대상에 자동 노출되도록 동적화")
> **Branch**: `feature/target-dynamic-from-role` (base: `development` HEAD `351d2e3`)
> **Predecessors**:
>   - PR #148 — `feature/rbac-fe-button-gates-phase1` (머지 완료, 2026-05-06)
>   - PR #149 — `feature/rbac-fe-button-gates-phase2` (머지 완료, 2026-05-06)
> **Sibling Memory**: `project_target_dynamic_from_role.md` (사용자 동의 2026-05-06)
> **Related**: `project_rbac_decisions.md`, `project_admin_area_role_policy.md`

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 권한관리 UI 에서 신규 권한(role) 추가 시 **4개 화면 동작 비일관**: 회원관리 상세 SelectBox 는 `qp_roles` 동적 조회로 즉시 노출되지만, **콘텐츠 게시대상 / 홈화면공지 게시대상 / 대량메일 수신대상**은 schema 자체가 6 권한 정적 모델로 잠겨 있어 신규 권한이 노출되지 않는다. 추가로 `AUTH_ROLE_TO_TARGET[role] ?? "non_member"` 폴백 결함으로 신규 권한 회원이 콘텐츠 접근 시 **비회원 처리되는 잠재 버그**까지 동반. |
| **Solution** | (1) 4개 영역의 schema 잠금을 `qp_roles` 기반 동적 모델로 전환: `ContentTarget.targetType` enum → `roleCode nullable`, `HomeNotice.targetXxx` boolean 6개 → `HomeNoticeTarget` 정규화 신규 테이블, `MassMail.targetXxx` boolean 6개 → `MassMailTarget` 정규화 신규 테이블, `MassMailRecipient.authRole RecipientAuthRole` enum → `String`. (2) `qp_roles.isSystem` 컬럼 추가 + 6 기본 권한 보호 가드 (사용여부/권한코드/삭제 변경 차단, 권한명만 변경 허용). (3) `canAccessContent` 재설계 — `AUTH_ROLE_TO_TARGET` 폴백 제거, roleCode 직접 비교 + `null = 비회원` 분기. (4) JWT `authRole` 검증 동적화 — 신규 권한 부여한 회원도 로그인 가능. (5) FE 의 `useTargetLabels` / `ALL_TARGET_TYPES` 등 정적 옵션 코드 동적화. |
| **Function/UX Effect** | 권한관리에서 새 권한 추가(`isActive=Y`) → **4개 화면 게시대상/수신대상 옵션에 즉시 노출**. 권한 비활성(`isActive=N`) → 옵션 자동 숨김. 권한명 변경 → 모든 화면 즉시 반영(현재도 라벨링 동적, 메커니즘 통일). 신규 권한 부여받은 회원도 정상 로그인 + 콘텐츠 접근. 6 기본 권한은 권한명만 수정 가능, 권한코드/사용여부/삭제는 운영자가 못 건드림. |
| **Core Value** | 권한관리가 **운영 콘솔의 단일 진실 원천**으로 완성. 신규 권한 정의 → 게시 대상 노출 → 회원 권한 변경 → 콘텐츠 접근 의 흐름이 한 데이터 소스(`qp_roles`)로 일관 동작. 6 기본 권한 시스템 보호 가드로 운영 실수 방지. |

---

## 1. Overview

### 1.1 Purpose

권한관리에서 정의한 권한이 **4개 화면 게시대상/수신대상 옵션에 자동 반영**되도록 schema 자체를 동적 모델로 전환한다. 현재 시스템에 **정합성 깨진 2개 메커니즘**이 공존:

| 메커니즘 | 동작 | 신규 권한 반영 |
|---|---|:---:|
| **권한명 동기화** (`useTargetLabels.resolveLabel`) | qp_roles 동적 조회로 라벨링 | ✓ 이름 갱신 |
| **옵션 목록** (enum / boolean 6개) | schema 잠금 | ✗ 신규 옵션 미노출 |

→ 시스템이 **절반만 연결된 상태**. 이를 동적 모델로 통일.

### 1.2 Background

#### 발견 경로
2026-05-06 사용자 권한 테스트 중 발견:
- 권한관리 화면에서 신규 권한 D(권한코드/권한명/CRUD) 추가
- 회원관리 상세 SelectBox 에는 D 노출됨 (✓)
- 홈화면공지 / 대량메일 / 콘텐츠 게시대상 SelectBox 에는 D 미노출 (✗)
- 사용자 결정: **권한관리 = 단일 진실 원천** 정합성 회복

#### 권한 정책 (사용자 명세, 2026-05-07)

| 권한 분류 | `isSystem` | `isActive` (사용여부) | `roleCode` | `roleName` (권한명) | 삭제 |
|---|:---:|:---:|:---:|:---:|:---:|
| **6 기본** (SUPER_ADMIN/ADMIN/GENERAL/1ST_STORE/2ND_STORE/SEKO) | `true` | **Y 고정** ✗ | 변경 불가 ✗ | 변경 가능 ✓ | **불가 ✗** |
| **추가 권한** (운영자 생성) | `false` | 변경 가능 ✓ (Y/N) | 생성 후 변경 불가 ✗ | 변경 가능 ✓ | **불가 ✗** (isActive=N 으로 대체) |

→ 모든 권한 hard delete 없음 (소프트 비활성화만, `project_rbac_decisions.md` M-2 정책과 일관).

#### 현재 schema 구조 (2026-05-07 코드 검수)

| 영역 | 모델 | 잠금 방식 |
|---|---|---|
| 콘텐츠 게시대상 | `ContentTarget` (`schema.prisma:158`) | `targetType TargetType` enum 5종 |
| 홈공지 게시대상 | `HomeNotice` 본체 (`schema.prisma:298`) | `targetSuperAdmin/targetAdmin/targetFirstStore/targetSecondStore/targetConstructor/targetGeneral` boolean **6개 컬럼** |
| 대량메일 송신정의 | `MassMail` 본체 (`schema.prisma:324`) | 동일 boolean **6개 컬럼** |
| 대량메일 수신스냅샷 | `MassMailRecipient` (`schema.prisma:379`) | `authRole RecipientAuthRole` enum 6종 |
| qp_roles | `QpRole` (`schema.prisma:12`) | `isSystem` 컬럼 **없음** — 6 기본 권한 보호 가드 누락 |

#### BE 매핑 결함 (`src/lib/auth.ts`)
```typescript
const AUTH_ROLE_TO_TARGET: Record<AuthRole, TargetType> = {
  '1ST_STORE': 'first_store',
  // ...
};
const target = AUTH_ROLE_TO_TARGET[role] ?? 'non_member';  // ← 신규 권한은 비회원 처리
```

#### JWT 검증 정적화 (`src/lib/schemas/auth.ts:89`)
```typescript
authRole: z.enum(authRoleValues).optional(),  // ← 6 기본 enum 만 통과, 신규 권한 거부
```

#### NON_MEMBER 처리 정책 (단정, 2026-05-07)

비회원(`non_member`)은 **권한관리 시스템 외부**(코드 의도, `useTargetLabels.ts:15`):
- → `qp_roles` 에 시스템 row 추가 안 함
- → `ContentTarget.roleCode nullable` + `null = 비회원` 처리
- → `canAccessContent` 비로그인 분기: `targets.some(t => t.roleCode === null)`

### 1.3 Non-goals

- 권한관리 UI 의 신규 권한 추가/수정 동작 변경 (이미 정상)
- 회원관리 상세 SelectBox 자체 (이미 동적)
- `qp_roles` 시드 6 기본 권한 변경 (기존 유지, isSystem=true 부착)
- 권한 매트릭스(`qp_role_menu_permissions`) 변경 (별도 영역)
- 신규 권한 추가 후 권한 매트릭스 자동 시드 (운영자 명시 설정 — 기존 동작)
- `RecipientAuthRole` 의 발송 시점 snapshot 기능 자체 (값만 enum → String)
- 대량메일 발송 후 수신자별 status 추적 (영향 없음)

---

## 2. Scope

### 2.1 In Scope — Schema 변경 (~5 항목)

- [ ] **`prisma/schema.prisma`**
  - [ ] **`QpRole` 에 `isSystem Boolean @default(false) @map("is_system")` 컬럼 추가**
  - [ ] **`enum TargetType` 제거** (`first_store/second_store/seko/general/non_member` 5종)
  - [ ] **`ContentTarget.targetType TargetType` → `roleCode String? @db.VarChar(50)`** (nullable, `null = 비회원`)
  - [ ] **`ContentTarget.role QpRole? @relation(...)` FK** (RESTRICT, optional)
  - [ ] **`HomeNotice` 의 `targetSuperAdmin/targetAdmin/targetFirstStore/targetSecondStore/targetConstructor/targetGeneral` boolean 6개 제거**
  - [ ] **`HomeNoticeTarget` 신규 정규화 테이블** (`homeNoticeId Int + roleCode String + role QpRole FK`)
  - [ ] **`MassMail` 의 boolean 6개 (`targetSuperAdmin` 등) 제거**
  - [ ] **`MassMailTarget` 신규 정규화 테이블** (`massMailId Int + roleCode String + role QpRole FK`)
  - [ ] **`MassMailRecipient.authRole RecipientAuthRole` → `authRoleCode String @db.VarChar(50)`** (snapshot, FK 없음 — 발송 후 권한 변경/삭제와 무관하게 수신 시점 보존)
  - [ ] **`enum RecipientAuthRole` 제거**

### 2.2 In Scope — 마이그레이션 SQL (`prisma/migrations/<timestamp>_target_dynamic_from_role/migration.sql`)

5단계 트랜잭션:

- [ ] **단계 1 — qp_roles isSystem 추가 + 6 기본 권한 마킹**
  ```sql
  ALTER TABLE qp_roles ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;
  UPDATE qp_roles SET is_system = TRUE
    WHERE role_code IN ('SUPER_ADMIN','ADMIN','GENERAL','1ST_STORE','2ND_STORE','SEKO');
  -- isActive 도 강제 TRUE 보장 (사용여부 Y 고정)
  UPDATE qp_roles SET is_active = TRUE
    WHERE role_code IN ('SUPER_ADMIN','ADMIN','GENERAL','1ST_STORE','2ND_STORE','SEKO');
  ```
- [ ] **단계 2 — ContentTarget 변환** (enum → nullable roleCode)
  ```sql
  ALTER TABLE qp_content_targets ADD COLUMN role_code VARCHAR(50) NULL;
  UPDATE qp_content_targets SET role_code = '1ST_STORE'  WHERE target_type = '1st_store';
  UPDATE qp_content_targets SET role_code = '2ND_STORE'  WHERE target_type = '2nd_store';
  UPDATE qp_content_targets SET role_code = 'SEKO'       WHERE target_type = 'seko';
  UPDATE qp_content_targets SET role_code = 'GENERAL'    WHERE target_type = 'general';
  UPDATE qp_content_targets SET role_code = NULL         WHERE target_type = 'non_member';
  ALTER TABLE qp_content_targets DROP COLUMN target_type;
  ALTER TABLE qp_content_targets
    ADD CONSTRAINT fk_content_target_role
    FOREIGN KEY (role_code) REFERENCES qp_roles(role_code) ON DELETE RESTRICT;
  ```
- [ ] **단계 3 — HomeNotice 정규화** (boolean 6개 → HomeNoticeTarget 행 변환)
  ```sql
  CREATE TABLE qp_home_notice_targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    home_notice_id INT NOT NULL,
    role_code VARCHAR(50) NOT NULL,
    UNIQUE KEY uq_notice_role (home_notice_id, role_code),
    FOREIGN KEY (home_notice_id) REFERENCES qp_home_notices(id) ON DELETE CASCADE,
    FOREIGN KEY (role_code) REFERENCES qp_roles(role_code) ON DELETE RESTRICT
  );
  -- boolean 6개 → row 변환
  INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
    SELECT id, 'SUPER_ADMIN' FROM qp_home_notices WHERE target_super_admin = TRUE;
  INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
    SELECT id, 'ADMIN' FROM qp_home_notices WHERE target_admin = TRUE;
  INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
    SELECT id, '1ST_STORE' FROM qp_home_notices WHERE target_first_store = TRUE;
  INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
    SELECT id, '2ND_STORE' FROM qp_home_notices WHERE target_second_store = TRUE;
  INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
    SELECT id, 'SEKO' FROM qp_home_notices WHERE target_constructor = TRUE;
  INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
    SELECT id, 'GENERAL' FROM qp_home_notices WHERE target_general = TRUE;
  ALTER TABLE qp_home_notices
    DROP COLUMN target_super_admin, DROP COLUMN target_admin,
    DROP COLUMN target_first_store, DROP COLUMN target_second_store,
    DROP COLUMN target_constructor, DROP COLUMN target_general;
  ```
- [ ] **단계 4 — MassMail 정규화** (HomeNotice 와 동일 패턴 + MassMailRecipient 변환)
  ```sql
  -- MassMailTarget 신규 + 변환 (HomeNotice 와 동일 6단계 INSERT + DROP)
  CREATE TABLE qp_mass_mail_targets ( ... );
  INSERT INTO qp_mass_mail_targets ... ;  -- 6 boolean → row
  ALTER TABLE qp_mass_mails DROP COLUMN target_super_admin, ... ;

  -- MassMailRecipient.authRole enum → String snapshot
  ALTER TABLE qp_mass_mail_recipients ADD COLUMN auth_role_code VARCHAR(50) NULL;
  UPDATE qp_mass_mail_recipients SET auth_role_code = 'SUPER_ADMIN'  WHERE auth_role = 'SUPER_ADMIN';
  UPDATE qp_mass_mail_recipients SET auth_role_code = 'ADMIN'        WHERE auth_role = 'ADMIN';
  UPDATE qp_mass_mail_recipients SET auth_role_code = '1ST_STORE'    WHERE auth_role = 'FIRST_STORE';
  UPDATE qp_mass_mail_recipients SET auth_role_code = '2ND_STORE'    WHERE auth_role = 'SECOND_STORE';
  UPDATE qp_mass_mail_recipients SET auth_role_code = 'SEKO'         WHERE auth_role = 'SEKO';
  UPDATE qp_mass_mail_recipients SET auth_role_code = 'GENERAL'      WHERE auth_role = 'GENERAL';
  ALTER TABLE qp_mass_mail_recipients DROP COLUMN auth_role;
  ALTER TABLE qp_mass_mail_recipients MODIFY auth_role_code VARCHAR(50) NOT NULL;
  -- snapshot 이라 FK 없음 (수신 시점 보존, 권한 변경/삭제 무관)
  ```
- [ ] **단계 5 — enum 제거 + 검증**
  - [ ] enum `TargetType` DROP (Prisma migration 자동 처리)
  - [ ] enum `RecipientAuthRole` DROP
  - [ ] 검증 SELECT (`qp_roles` 6 기본 모두 isSystem=TRUE / 모든 변환 행 카운트 보존)

### 2.3 In Scope — BE 코드 (~10 files)

- [ ] **`src/lib/auth.ts`**
  - [ ] `AUTH_ROLE_TO_TARGET` 매핑 제거
  - [ ] `canAccessContent(user, contentTargets)` 재설계
    - SUPER_ADMIN/ADMIN: 전체 통과
    - 비로그인: `targets.some(t => t.roleCode === null)` 통과 (비회원 게시대상 = null)
    - 로그인: `targets.some(t => t.roleCode === user.authRole)` 통과
  - [ ] `resolveActiveRoleCodes()` 헬퍼 추출 (qp_roles 활성 roleCode 동적 조회, BE/FE 검증 공유)

- [ ] **`src/lib/schemas/auth.ts`**
  - [ ] `authRole: z.enum(authRoleValues).optional()` → **동적 검증** (활성 roleCode 또는 6 기본 enum)
  - [ ] JWT payload validate 시 신규 권한 D 도 통과

- [ ] **`src/lib/schemas/common.ts`**
  - [ ] `targetTypeValues` 제거
  - [ ] `authRoleValues` 는 6 기본 보호용 SYSTEM_ROLE_CODES 상수로 재정의

- [ ] **`src/lib/schemas/content.ts`** + 홈공지/대량메일 스키마
  - [ ] `targetType` → `roleCode` 검증 변경
  - [ ] `superRefine` 또는 `transform` 으로 활성 roleCode 검증 (Zod safeParse 패턴)

- [ ] **`src/app/api/role-labels/route.ts`**
  - [ ] `targetType` 필드 제거, `roleCode` 통일

- [ ] **`src/app/api/roles/[roleCode]/route.ts`** (PUT)
  - [ ] **6 기본 권한 보호 가드 — `isSystem=true` row 의 `isActive` / `roleCode` 변경 거부 (400)**, `roleName` 만 허용
  - [ ] 신규 권한 생성 시 `isSystem=false` 강제 (운영자 input 무시)
  - [ ] reserved roleCode 차단 (예: `NON_MEMBER` — 추후 확장 대비)

- [ ] **`src/app/api/contents/**` + `src/app/api/home-notices/**` + `src/app/api/admin/mass-mails/**`**
  - [ ] `targetType` 사용처 → `roleCode` 로 갱신 (POST/PUT 입력 + GET 응답)
  - [ ] HomeNoticeTarget / MassMailTarget INSERT 로직 추가

- [ ] **`src/lib/mass-mail/collect-recipients.ts`**
  - [ ] boolean 6개 분기 제거, MassMailTarget 행 기반으로 동적 수신자 collect

- [ ] **`src/lib/openapi.ts`**
  - [ ] TargetType enum 참조 제거, roleCode 문자열로 갱신
  - [ ] HomeNoticeTarget / MassMailTarget 신규 스키마 정의

### 2.4 In Scope — FE 코드 (~12 files)

- [ ] **`src/hooks/use-target-labels.ts`** — 핵심 동적화 진입점
  - [ ] `ALL_TARGET_TYPES` 정적 배열 제거
  - [ ] `qp_roles` 동적 조회 (TanStack Query, staleTime 5분)
  - [ ] `non_member` 분기 → `roleCode === null` 분기로 변경
  - [ ] `resolveLabel(roleCode)` / `getActiveOptions()` 시그니처 호환 유지

- [ ] **콘텐츠 도메인** (~5 files)
  - [ ] `src/components/contents/create/contents-form-post-target.tsx` — `POST_TARGET_ROW_KEYS` 동적
  - [ ] `src/components/contents/list/contents-search.tsx` — 검색 필터 동적
  - [ ] `src/components/contents/contents-filter-data.ts` — 정적 옵션 제거
  - [ ] `src/components/contents/list/contents-table.tsx` — targetType 표시 → roleCode + label
  - [ ] `src/components/contents/detail/contents-detail-target.tsx` — 상세 표시

- [ ] **홈공지 도메인** (~3 files)
  - [ ] `src/components/admin/notices/notices-table.tsx` — 게시대상 컬럼/필터
  - [ ] `src/components/admin/notices/notices-search.tsx` — 검색 옵션
  - [ ] `src/components/popup/notice-form-popup.tsx` — 등록/수정 모달 (HomeNoticeTarget 사용)

- [ ] **대량메일 도메인** (~2 files)
  - [ ] `src/components/admin/bulk-mail/form/bulk-mail-form-targets.tsx` — `TARGET_TYPE_TO_UI_VALUE` 제거 + 동적 옵션
  - [ ] `src/components/admin/bulk-mail/bulk-mail-types.ts` — RecipientAuthRole 타입 제거 → String

- [ ] **권한관리 도메인** (~2 files)
  - [ ] `src/components/admin/permissions/permissions-table.tsx` — **6 기본 권한 (isSystem=true) 행의 사용여부 토글 disabled, 권한코드 readonly, 삭제 버튼 hidden**
  - [ ] `src/components/popup/permission-menu-popup.tsx` — 6 기본 권한 매트릭스 변경 가드 (기존 유지)

### 2.5 누락 방지 체크리스트 (머지 전 필수)

- [ ] `enum TargetType` 참조 0건 (`git grep TargetType` generated 제외)
- [ ] `enum RecipientAuthRole` 참조 0건
- [ ] `AUTH_ROLE_TO_TARGET` 참조 0건
- [ ] `targetTypeValues` 참조 0건
- [ ] `ALL_TARGET_TYPES` 참조 0건
- [ ] `targetSuperAdmin/targetAdmin/targetFirstStore/targetSecondStore/targetConstructor/targetGeneral` 참조 0건 (마이그레이션 SQL 제외)
- [ ] `first_store` / `second_store` / `non_member` 등 snake_case 리터럴 참조 0건 (마이그레이션 SQL 제외)
- [ ] schema 변경 후 `pnpm prisma generate` 통과
- [ ] OpenAPI 스펙(`src/lib/openapi.ts`) 의 enum 참조 0건
- [ ] **6 기본 권한 보호 가드 — PUT /api/roles/[roleCode] 시 isActive/roleCode 변경 거부 검증**
- [ ] **JWT authRole 동적 검증 — 신규 권한 D 부여한 회원 로그인 가능 검증**
- [ ] 4개 화면 (회원관리/홈공지/대량메일/콘텐츠) 검색·등록·수정·삭제 회귀 0건
- [ ] 권한관리에서 신규 권한 D 추가(`isActive=Y`) → 4개 화면 옵션 즉시 노출 시각 검증
- [ ] 권한 비활성(`isActive=N`) 토글 → 4개 화면 옵션 자동 숨김 검증
- [ ] 신규 권한 D 회원이 D 게시대상 콘텐츠 접근 200 검증
- [ ] 비로그인 사용자 → 비회원 게시대상 콘텐츠 (`roleCode IS NULL`) 정상 접근 200 검증
- [ ] 마이그레이션 dry-run 후 dev DB 실 실행 → 데이터 손실 0건 (변환 전후 카운트 비교)
- [ ] lint / typecheck / build 0 errors

### 2.6 Out of Scope (별도 PR / 후속)

- 권한관리 신규 권한 추가 시 권한 매트릭스 기본값 자동 시드 (현재는 운영자 명시 설정)
- 권한 변경 push (real-time invalidate) — TanStack staleTime 5분 정책 유지
- mypage `MY_*` matrix dead 정리 (Priority 3, 별도 PR)
- `interface-logs` 메뉴코드 신설 (Priority 3, 별도 PR)
- 회원관리 상세 권한 변경 가능 대상 확장 (현재 `userTp === "GENERAL"` 만, 정책 변경 영역)

---

## 3. Requirements

| ID | Requirement | Priority | 근거 |
|----|-------------|:--------:|------|
| FR-01 | `enum TargetType` / `enum RecipientAuthRole` / boolean 6개 컬럼 모두 제거, `qp_roles.roleCode` 기반 동적 모델로 전환 | High | 단일 진실 원천 회복 |
| FR-02 | 권한관리에서 신규 권한 추가(`isActive=Y`) 시 4개 화면 옵션에 즉시 노출 | High | 본 PR 핵심 가치 |
| FR-03 | 권한 비활성(`isActive=N`) 토글 시 4개 화면 옵션 즉시 숨김 | High | 운영 정합성 |
| FR-04 | `canAccessContent` roleCode 직접 비교 + `null = 비회원` 분기 | High | 폴백 결함 근절 |
| FR-05 | JWT `authRole` 검증 동적화 — 신규 권한 부여 회원 로그인 가능 | High | 사용자 부여 → 로그인 → 콘텐츠 접근 일관성 |
| FR-06 | 6 기본 권한 (`isSystem=true`) 의 isActive / roleCode 변경 거부 (400), 삭제 차단, roleName 만 허용 | High | 사용자 정책 명세 (2026-05-07) |
| FR-07 | 추가 권한 (`isSystem=false`) 의 roleCode 는 생성 후 변경 불가, 삭제 불가 (isActive=N 으로만), roleName/isActive 자유 편집 | High | 사용자 정책 명세 (2026-05-07) + FK 무결성 |
| FR-08 | 마이그레이션 — `enum TargetType.non_member` 행은 `roleCode IS NULL` 로 변환 | High | NON_MEMBER 외부 sentinel 정책 |
| FR-09 | 마이그레이션 — boolean 6개 → `HomeNoticeTarget` / `MassMailTarget` 행 변환 (카운트 보존) | High | 데이터 무결성 |
| FR-10 | `MassMailRecipient.authRoleCode` snapshot — FK 없이 발송 시점 권한 보존 | High | 발송 후 권한 변경/삭제 무관 |
| FR-11 | OpenAPI 스펙 동기화 — enum 참조 0건, roleCode 문자열로 갱신 | Medium | rules/api.md 동기화 의무 |
| FR-12 | Zod safeParse — 외부 입력 + DB 응답 모두 활성 roleCode 검증 | High | rules/api.md Zod 검증 의무 |
| NFR-01 | 기존 4개 화면 검색/등록/수정/삭제 회귀 0건 | High | 안정성 |
| NFR-02 | 6 role 모두 (SUPER_ADMIN/ADMIN/1ST_STORE/2ND_STORE/SEKO/GENERAL) 콘텐츠 접근 동작 변화 없음 | High | UX 보존 |
| NFR-03 | 비로그인 사용자 비회원 공개 콘텐츠 접근 동작 변화 없음 | High | UX 보존 |
| NFR-04 | TanStack Query staleTime 5분 정책 유지 | Medium | 정책 통일 |
| NFR-05 | TypeScript strict, lint·typecheck·build 0 errors | High | 프로젝트 표준 |
| NFR-06 | dev 환경 마이그레이션 dry-run + 실 실행 → 데이터 손실 0건 | High | 마이그레이션 안전성 |

---

## 4. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|:------:|:-----------:|------------|
| **R1**: 마이그레이션 5단계 중 한 단계 실패 시 부분 적용 | High | Medium | 마이그레이션 SQL 전체를 트랜잭션 BEGIN/COMMIT 으로 감싸기. dev DB 백업 1회 + dry-run 후 실 실행. 단계별 검증 SELECT 추가 |
| **R2**: HomeNotice / MassMail boolean → 행 변환 시 카운트 불일치 | High | Low | 변환 전후 SELECT 카운트 비교 검증. 6개 boolean true 합계 = HomeNoticeTarget 행 수 일치 보장 |
| **R3**: `MassMailRecipient.authRole` snapshot 변환 — `FIRST_STORE` → `1ST_STORE` 등 표기 mismatch | Medium | Medium | 변환 매핑 명시 (마이그레이션 §2.2 단계 4). 누락 row 0건 검증 (`WHERE auth_role_code IS NULL` 0) |
| **R4**: JWT 검증 동적화 후 기존 6 role 사용자 로그인 회귀 | High | Low | 6 기본 enum 도 dynamic 검증에 포함 (활성 roleCode 조회 시 isSystem=true 도 포함). E2E 6 role 로그인 회귀 검증 |
| **R5**: 6 기본 권한 보호 가드 누락 → 운영자가 ADMIN 비활성화 → admin 영역 lockout | High | Medium | PUT /api/roles/[roleCode] 단위 테스트 + 권한관리 UI disabled 처리 + 마이그레이션에서 isActive=TRUE 강제 보장 |
| **R6**: `useTargetLabels` 시그니처 변경으로 ~12 호출처 회귀 | Medium | Medium | 호환 시그니처 유지 (`resolveLabel(roleCode)` → 라벨 반환). 호출처 일괄 검증 |
| **R7**: TanStack Query 첫 로드 시 옵션 빈 배열 (`isLoading` 동안) | Medium | High (발생) | Skeleton/loading state UX. SelectBox 비활성. PR-1 패턴 (`if (isPermLoading) return;`) 미러링 |
| **R8**: 마이그레이션 후 generated client 와 schema 불일치 | Low | High (발생) | `pnpm prisma generate` CI 빌드 단계 + 컨테이너 entrypoint `prisma migrate deploy` 필수 |
| **R9**: collect-recipients.ts 의 boolean 분기 변환 누락 | Medium | Medium | MassMailTarget 정규화 후 SQL 쿼리로 동적 collect. 단위 테스트 추가 |
| **R10**: 다른 작업자가 enum 신규 참조 추가 (작업 기간 중) | Low | Low | 작업 시작 시 development sync, 머지 직전 rebase 후 충돌 검증 |
| **R11**: NON_MEMBER null 처리로 인한 NULL 비교 누락 (`roleCode === null` vs `=` 등) | Medium | Medium | TypeScript strict null check 활용. 검증 헬퍼에서 명시적 분기 |

---

## 5. Test Plan (Plan 단계 — 상세는 Design)

### 5.1 마이그레이션 검증
- [ ] dev DB 백업 1회
- [ ] 마이그레이션 dry-run (트랜잭션 내 ROLLBACK)
- [ ] 변환 전후 SELECT 카운트 비교 (모든 영역 행 수 일치)
- [ ] qp_roles `isSystem=TRUE AND role_code IN (6 기본)` = 6 검증
- [ ] `qp_content_targets` 의 `role_code IS NULL` 행 = 기존 `target_type='non_member'` 행 수 일치
- [ ] `qp_home_notice_targets` 행 수 = (홈공지 boolean true 합계) 일치
- [ ] `qp_mass_mail_recipients.auth_role_code IS NULL` 0건

### 5.2 단위/통합 검증
- [ ] `canAccessContent` 단위 — 6 기본 role + 신규 권한 D + 비로그인 시나리오
- [ ] `resolveActiveRoleCodes` 단위 — isActive=true / isSystem=true 조합
- [ ] PUT `/api/roles/[roleCode]` 단위 — isSystem=true 시 isActive/roleCode 변경 거부 (400)
- [ ] JWT 발급 + 검증 단위 — 신규 권한 D 부여 회원 로그인 통과
- [ ] Zod schema — roleCode 검증 (활성/비활성/존재하지 않음)

### 5.3 E2E 시나리오 (시각 검증)
- [ ] 권한관리 신규 권한 D 추가 (isActive=Y) → 4개 화면 옵션 즉시 노출
- [ ] D 비활성 (isActive=N) 토글 → 4개 화면 옵션 즉시 숨김
- [ ] D 권한명 변경 → 4개 화면 라벨 즉시 갱신
- [ ] 6 기본 권한 사용여부 토글 시도 → UI disabled, API 거부 (400)
- [ ] 6 기본 권한 권한명 변경 → 정상 + 라벨 즉시 갱신
- [ ] 6 기본 권한 삭제 시도 → UI 버튼 없음 (또는 비활성화)
- [ ] 추가 권한 삭제 시도 → UI 버튼 없음 (isActive=N 으로 대체)
- [ ] 회원관리 상세에서 일반회원에게 D 부여 → JWT 발급 → D 게시대상 콘텐츠 접근 200
- [ ] 비로그인 사용자 → 비회원 게시대상 콘텐츠 접근 200
- [ ] 6 role × 4 화면 = 24 케이스 회귀 검증

### 5.4 회귀 검증
- [ ] 콘텐츠 등록/수정/삭제/검색 동작 변화 없음
- [ ] 홈공지 등록/수정/삭제/검색 + 동일기간 5건 한도(권한별) 동작 보존
- [ ] 대량메일 등록/송신/재송신 + 수신자 collect 정상
- [ ] 회원관리 상세 권한 변경 동작 변화 없음
- [ ] 권한관리 신규 권한 추가/수정 (추가 권한) 동작 보존

---

## 6. Dependencies

| Dependency | Status |
|------------|:------:|
| PR #148 머지 (RBAC FE 버튼 가드 PR-1) | ✅ 완료 (2026-05-06) |
| PR #149 머지 (RBAC FE 버튼 가드 PR-2) | ✅ 완료 (2026-05-06) |
| `qp_roles` 시드 6 기본 권한 | ✅ 완료 (PR #72, 2026-04-22) |
| Redmine #2178 (회원관리 상세 권한 변경 동적 검증) | ✅ 완료 (사용자 권한 부여 동적 검증 가능) |
| `useTargetLabels.resolveLabel` 동적 라벨링 | ✅ 완료 (기존 코드) |
| Redmine 신규 이슈 생성 | ⏳ **사용자 작업** (이슈 번호 확정 후 본 plan 의 Redmine 필드 업데이트) |

**선결 조건**: Redmine 이슈 번호 확정 + design 문서 작성 + dev DB 백업.

---

## 7. Implementation Order

작업 규모 5~7일 / ~25 파일 / 단일 PR. 마이그레이션 안전성 우선:

1. **Design 문서 작성** — schema diff 정의, 마이그레이션 SQL 5단계 명시, BE 헬퍼 시그니처 합의
2. **Schema + 마이그레이션** — `prisma/schema.prisma` 변경 + `prisma migrate dev --name target_dynamic_from_role` + migration.sql 수동 보정 + dev DB dry-run
3. **BE 공용 헬퍼** — `canAccessContent` 재설계 + `resolveActiveRoleCodes` 추출
4. **6 기본 권한 보호 가드** — PUT /api/roles/[roleCode] 의 isSystem 가드
5. **JWT authRole 검증 동적화** — `src/lib/schemas/auth.ts`
6. **BE API 라우트** — contents / home-notices / mass-mails 의 enum/boolean → roleCode 갱신 + collect-recipients
7. **FE 핵심 훅** — `useTargetLabels` 동적화 (호환 시그니처 유지)
8. **FE 화면별 통합** — 콘텐츠 → 홈공지 → 대량메일 → 권한관리 UI 순서
9. **OpenAPI 동기화** — `src/lib/openapi.ts`
10. **회귀 검증** — §5.4 시나리오 시각 검증
11. **E2E 시각 검증** — §5.3 24 케이스 + 6 기본 권한 보호 가드 검증
12. **lint / typecheck / build** 통과 후 PR 생성

각 단계 완료 시점에 lint/typecheck 통과 확인.

---

## 8. Related Documents

- **Sibling Memory**: `project_target_dynamic_from_role.md` (사용자 동의 2026-05-06)
- **선행 PR**: [PR #148](https://github.com/nalpari/qpartners-neo/pull/148), [PR #149](https://github.com/nalpari/qpartners-neo/pull/149)
- **선행 RBAC 결정**: `project_rbac_decisions.md`, `project_admin_area_role_policy.md`
- **Design Doc (예정)**: [target-dynamic-from-role.design.md](../../02-design/features/target-dynamic-from-role.design.md)
- **참조 schema**: `prisma/schema.prisma:158/298/324/379/462/484` (현재 enum/boolean 잠금)
- **참조 코드**: `src/lib/auth.ts` (현재 `AUTH_ROLE_TO_TARGET`), `src/hooks/use-target-labels.ts` (현재 `ALL_TARGET_TYPES`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 (Draft) | 2026-05-07 | Initial draft. PR #148/149 머지 후 후속 PR 으로 분리 착수. | CK |
| 0.2 (Draft) | 2026-05-07 | 코드 검수 결과 반영 — 4개 영역 정확화 (콘텐츠 enum + 홈공지/대량메일 boolean 6개 + MassMailRecipient enum + qp_roles isSystem 누락). 사용자 권한 정책 명세 반영 (2026-05-07): 6 기본 isActive Y 고정 + 모든 권한 hard delete 없음. NON_MEMBER nullable 단정 (`useTargetLabels.ts:15` 코드 의도 반영 — 비회원은 권한관리 외부). JWT 검증 동적화 추가. 마이그레이션 5단계 SQL 정밀화. | CK |
