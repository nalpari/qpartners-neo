# RBAC Enforcement Phase 2 Planning Document

> **Summary**: `requireAdmin` 이분법을 `requireMenuPermission(menuCode, action)` 매트릭스 가드로 교체 (핵심 4개 도메인 한정)
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-23
> **Status**: Draft
> **Predecessor**: PR #72 ([feature/rbac-enforcement](https://github.com/nalpari/qpartners-neo/pull/72) — 시드 + `/auth/me/permissions`)
> **Branch**: `feature/rbac-enforcement-phase2` (base: `development`)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | PR #72 에서 FE 용 권한 조회(`/auth/me/permissions`)와 시드는 추가됐지만, 실제 서버 측 CUD 집행은 여전히 `requireAdmin`(SUPER_ADMIN ∪ ADMIN) 이분법으로만 동작한다. 매트릭스에 정의된 "ADMIN 이 CUD 가능한 메뉴 = 5개(MEMBERS/BULK_MAIL/NOTICES/CATEGORIES/CONTENT)" 가 서버에 적용되지 않아 ADMIN 이 CODES 등을 조작할 수 있는 논리 누수 상태. |
| **Solution** | `requireMenuPermission(menuCode, action)` 공용 가드를 신설하고, 핵심 4개 도메인(**CONTENT / MEMBERS / BULK_MAIL / CODES**)의 CUD 라우트를 교체. 권한 판정 로직은 `GET /api/auth/me/permissions` 와 **완전 동일**하게 유지 (FE/BE 권한 해석 일관성). |
| **Function/UX Effect** | 사용자 대면 UX 변경 없음. ADMIN 이 매트릭스상 CUD 금지 메뉴(CODES 등) 호출 시 403 응답. SUPER_ADMIN 은 기존 동작 그대로(fail-open). |
| **Core Value** | 권한 매트릭스를 **실제 집행 가능한 계약**으로 전환. 향후 22 개 라우트 확산 시 교체는 1-line 패턴으로 축소. |

---

## 1. Overview

### 1.1 Purpose
PR #72 Scope-out 으로 분리됐던 **Phase 2 — API Enforcement** 의 1차 구현. 전체 교체가 아닌 **핵심 4개 도메인 한정**으로 범위를 좁혀 regression risk 를 제한한다.

### 1.2 Background
- **PR #72 에서 이미 완료**: Menu(12) / QpRole(6) / QpRoleMenuPermission(72) 시드, `GET /api/auth/me/permissions` 엔드포인트, PUT lockout 3중화
- **현재 상태 (조사 결과, 2026-04-23)**: CUD 를 수행하는 모든 `/api/*` 라우트가 `requireAdmin` 사용 중. `requireMenuPermission`-like 구조 없음
- **권한 매트릭스 (PR #72)**:
  - SUPER_ADMIN: 12 / 12 / 12 / 12 (전체 CRUD)
  - ADMIN: 12 / 5 / 5 / 5 (MEMBERS / BULK_MAIL / NOTICES / CATEGORIES / CONTENT 만 CUD)
  - 1ST_STORE / 2ND_STORE / SEKO / GENERAL: 4 / 0 / 0 / 0 (read only)

### 1.3 Non-goals
- **SUPER_ADMIN-only 경로 유지**: `PUT /api/roles/[roleCode]/permissions` 는 `requireSuperAdmin` 계속 사용 (PR #72 Lockout 3중화 설계 보존)
- **소비자 read 경로 비대상**: 게시대상(target) 기반 리소스 ACL 이 적용된 라우트 (예: `contents/[id]/files/[fileId]/download`) 는 Phase 2 교체 대상 아님
- **공개 조회 비대상**: `codes/lookup` 같은 화이트리스트 공개 API 는 유지

---

## 2. Scope

### 2.1 In Scope — 핵심 4개 도메인 (14 개 라우트 파일)

- [ ] **CONTENT** (menuCode: `CONTENT`) — 5 파일
  - `src/app/api/contents/route.ts` (POST)
  - `src/app/api/contents/[id]/route.ts` (PUT/DELETE)
  - `src/app/api/contents/[id]/files/route.ts` (POST)
  - `src/app/api/contents/[id]/files/[fileId]/route.ts` (PUT/DELETE)
  - (참고: `.../download`, `.../download-all` 은 `canAccessContent` 기반 — **제외**)

- [ ] **MEMBERS** (menuCode: `MEMBERS`) — 3 파일
  - `src/app/api/admin/members/route.ts`
  - `src/app/api/admin/members/[id]/route.ts`
  - `src/app/api/admin/members/[id]/reset-password/route.ts`

- [ ] **BULK_MAIL** (menuCode: `BULK_MAIL`) — 3 파일
  - `src/app/api/admin/mass-mails/route.ts`
  - `src/app/api/admin/mass-mails/[id]/route.ts`
  - `src/app/api/admin/mass-mails/[id]/retry/route.ts`

- [ ] **CODES** (menuCode: `CODES`) — 4 파일
  - `src/app/api/codes/route.ts`
  - `src/app/api/codes/[id]/route.ts`
  - `src/app/api/codes/[id]/details/route.ts`
  - `src/app/api/codes/[id]/details/[detailId]/route.ts`
  - (참고: `codes/lookup` 은 공개 화이트리스트 — **제외**)

- [ ] **공용 가드 신설**: `requireMenuPermission(menuCode, action)` in `src/lib/auth.ts`
- [ ] **OpenAPI 업데이트**: 교체된 라우트의 403 응답 description 갱신 (403 자체는 기존과 동일하게 반환)

### 2.2 Residual (PR #72 리뷰 이월분, 본 PR 에서 처리)
- [ ] **I-1**: middleware authRole fallback 해석 — 미확정 userTp/storeLvl 조합의 권한 매핑 명시화
- [ ] **I-4**: broad `catch` narrowing — 본 PR 에서 수정하는 라우트 한정
- [ ] **I-5**: `logError` Sentry 도입 — `src/lib/log-error.ts` 신설, 본 PR 범위의 라우트에서만 교체 (나머지 22 라우트는 후속 확산 시 함께 진행)

### 2.3 Out of Scope (후속 PR)
- **나머지 22 개 라우트 확산**: NOTICES / CATEGORIES / MENUS / ROLES / INTERFACE_LOGS / INQUIRY / 등 — 본 PR 이후 순차 교체
- **M-4 연동 이슈**: 부모 메뉴 soft-delete 시 자식 cascade
- **M-5**: `pageUrl` 정규식 검증
- **Phase 5 — 검증**: E2E 매트릭스, 거부 감사 로그, Feature flag 스왑, 캐싱 (per-request memo / Redis TTL)

---

## 3. Requirements

| ID | Requirement | Priority | 근거 |
|----|-------------|:--------:|------|
| FR-01 | `requireMenuPermission(menuCode, action)` 공용 가드 — 401/403 응답 형식은 기존 `requireAdmin` 과 동일 | High | 계약 일관성 |
| FR-02 | 권한 판정 로직은 `GET /api/auth/me/permissions` 와 바이트 단위로 동일 (SUPER_ADMIN fail-open, 시드 미등록 메뉴 fail-closed, 비활성 메뉴 fail-closed) | High | FE/BE 권한 해석 divergence 방지 |
| FR-03 | `menuCode` 인자 타입 안전성 — `MenuCode` 리터럴 유니온 타입 사용, 오타 시 TS 컴파일 에러 | High | 시드와 코드 drift 방지 |
| FR-04 | `action` 인자 4종: `"read" \| "create" \| "update" \| "delete"` | High | 매트릭스 컬럼 직접 매핑 |
| FR-05 | 4개 도메인의 14개 라우트 파일 전수 교체 | High | 범위 합의 |
| FR-06 | 403 응답 바디는 `{ error, menuCode, action }` 형식 (PR #72 PUT permissions 거부 응답과 통일) | Medium | 클라이언트 에러 핸들링 통일 |
| FR-07 | 캐싱 없음 — 1회 호출 = 1회 DB 조회 (per-request memo 는 Phase 5 에서 평가) | Low | Phase 2 는 정확성 우선 |
| FR-08 | OpenAPI 스펙의 403 description 에 "메뉴 권한 매트릭스 기반" 문구 추가 | Medium | `rules/api.md` — 코드-스펙 동기화 |
| NFR-01 | 교체 전후 SUPER_ADMIN 동작 동일 (regression 0) | High | 운영 관리자 안전 |
| NFR-02 | 교체 후 ADMIN 은 4개 도메인 CUD 계속 허용 (매트릭스 5개 중 CONTENT/MEMBERS/BULK_MAIL 포함) | High | UX 보존 |
| NFR-03 | **CODES CUD**: 교체 후 ADMIN 은 403 — **behavioral change 공지 필요** | High | 실제 권한 회수 — 릴리스 노트 항목 |

---

## 4. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|:------:|:-----------:|------------|
| **R1**: ADMIN 이 CODES CUD 가능하다는 암묵적 전제에 의존하는 운영 플로우 | High | Medium | 사전 확인 — 실제 dev/stg 에서 ADMIN 계정으로 CODES CUD 수행 이력 조회. 없으면 그대로 교체. 있으면 매트릭스 재검토 후 시드 조정 |
| **R2**: `/auth/me/permissions` 와 `requireMenuPermission` 의 판정 로직 divergence | High | Low | 공용 헬퍼 함수로 추출 (`resolveMenuPermission(user, menuCode)` → `{canRead, canCreate, canUpdate, canDelete}`) 후 양쪽에서 공유 |
| **R3**: Prisma 쿼리 N+1 (라우트당 1회 추가 쿼리) | Low | High (발생) | PR 범위 내는 per-request cache 없이 진행. Phase 5 에서 평가. 인덱스 존재 확인: `QpRoleMenuPermission.@@id([roleCode, menuCode])` 복합 PK 로 단건 lookup O(1) |
| **R4**: OpenAPI 403 description 누락 | Low | Medium | PR template checklist 에 OpenAPI 업데이트 항목 포함 |

---

## 5. Test Plan (Plan 단계 기준 — 상세는 Design 문서)

- [ ] Unit: `requireMenuPermission` — SUPER_ADMIN fail-open / 시드 미등록 403 / 비활성 메뉴 403 / 정상 통과
- [ ] Unit: `/auth/me/permissions` 와 `requireMenuPermission` 의 판정 결과 일치 검증 (동일 입력 → 동일 출력)
- [ ] Integration: 각 도메인 라우트에 대해 SUPER_ADMIN 200 / ADMIN 200 or 403(매트릭스 기준) / non-internal 403
- [ ] Regression: 기존 `requireAdmin` 교체분만 테스트 — 나머지 22 라우트 변화 없음 확인

---

## 6. Dependencies

| Dependency | Status |
|------------|:------:|
| PR #72 머지 (시드 + `/auth/me/permissions`) | ✅ 완료 (2026-04-22) |
| PR #74 머지 (`feature/auto-login-inbound`) | ⏳ Open — Phase 2 착수는 머지 후 |
| FE `useMenuPermission` 훅 연동 | ⏳ 독립 진행 (Phase 2 와 의존 없음) |

---

## 7. Related Documents

- **PR #72**: [feat: RBAC 메뉴 권한 시드 및 /auth/me/permissions 엔드포인트 추가](https://github.com/nalpari/qpartners-neo/pull/72)
- **Design Doc (짝)**: [rbac-enforcement-phase2.design.md](../../02-design/features/rbac-enforcement-phase2.design.md)
- **Memory**: `project_rbac_decisions.md` (FE/BE 합의 2026-04-21, C안 prefix 없음 + M-2 A안 + 매트릭스 확정)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-23 | Initial draft | CK |
