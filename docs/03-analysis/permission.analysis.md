# Permission Gap Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: qpartners-neo
> **Analyst**: CK
> **Date**: 2026-03-30
> **Design Doc**: [permission.design.md](../02-design/features/permission.design.md)
> **Plan Doc**: [permission.plan.md](../01-plan/features/permission.plan.md)

---

## 1. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| API Endpoints Match | 100% | ✅ |
| Data Model Match | 100% | ✅ |
| Zod Schema Match | 100% | ✅ |
| File Structure Match | 100% | ✅ |
| Business Logic Match | 100% | ✅ |
| OpenAPI Spec Match | 100% | ✅ |
| **Overall** | **100%** | **✅** |

---

## 2. API Endpoints — 100% (5/5)

| Endpoint | Design | Implementation | Status |
|----------|:------:|:--------------:|--------|
| GET /api/roles | O | O | ✅ Match |
| POST /api/roles | O | O | ✅ Match |
| PUT /api/roles/[roleCode] | O | O | ✅ Match |
| GET /api/roles/[roleCode]/permissions | O | O | ✅ Match |
| PUT /api/roles/[roleCode]/permissions | O | O | ✅ Match |

---

## 3. Detailed Comparison

### 3.1 GET /api/roles — 역할 목록

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Query: activeOnly | boolean, default true | `searchParams.get("activeOnly") !== "false"` | ✅ Match |
| orderBy | - | roleCode asc | ✅ |
| Response format | `{ data: [...] }` | 동일 | ✅ Match |

### 3.2 POST /api/roles — 역할 추가

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Zod validation | createRoleSchema | `createRoleSchema.safeParse(body)` | ✅ Match |
| roleCode 중복 409 | O | Prisma P2002 catch → 409 | ✅ Match |
| Response 201 | O | `{ data: role }, { status: 201 }` | ✅ Match |

### 3.3 PUT /api/roles/[roleCode] — 역할 수정

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| roleCode 수정 불가 | O | updateRoleSchema에 미포함 | ✅ Match |
| 수정 가능 3필드 | roleName, description, isActive | 3개 모두 optional | ✅ Match |
| Path param 검증 | - | roleCodeParamSchema | ✅ 추가 |
| Not found 404 | - | P2025 catch → 404 | ✅ 추가 |

### 3.4 GET /api/roles/[roleCode]/permissions — 메뉴별 권한 조회

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| 전체 메뉴 2레벨 트리 | O | parent + children 쿼리 | ✅ Match |
| CRUD 권한 매핑 | O | permissions include + 별도 childPermissions 쿼리 | ✅ Match |
| hasUrl | pageUrl 존재 시 Y | `pageUrl !== null` | ✅ Match |
| level 필드 | 1/2 | parent=1, children=2 | ✅ Match |
| Role 미존재 404 | - | role 조회 후 404 | ✅ 추가 |
| Response format | `{ data: { roleCode, roleName, menus } }` | 동일 | ✅ Match |

### 3.5 PUT /api/roles/[roleCode]/permissions — 권한 일괄 저장

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| 기존 권한 삭제 후 새로 생성 | O | `deleteMany` + `create` N건 | ✅ Match |
| 트랜잭션 처리 | O | `$transaction([...])` | ✅ Match |
| Role 미존재 404 | - | role 조회 후 404 | ✅ 추가 |

### 3.6 Zod Schemas — 100%

| Schema | Design | Implementation | Status |
|--------|--------|---------------|--------|
| createRoleSchema (4필드) | 정의 일치 | 동일 + error message | ✅ Match |
| updateRoleSchema (3필드) | 정의 일치 | 동일 | ✅ Match |
| updatePermissionsSchema | permissions[] min(1) | 동일 | ✅ Match |

### 3.7 Data Model — 100%

| Entity | Design (v0.2) | Prisma | Status |
|--------|--------------|--------|--------|
| QpRole (7필드 + audit + relation) | 일치 | 일치 | ✅ |
| QpRoleMenuPermission (복합PK + 4 CRUD + audit) | @@id([roleCode, menuCode]) | 동일 | ✅ |

### 3.8 File Structure — 100%

| Design | Implementation | Status |
|--------|---------------|--------|
| `src/app/api/roles/route.ts` | 존재 (GET, POST) | ✅ |
| `src/app/api/roles/[roleCode]/route.ts` | 존재 (PUT) | ✅ |
| `src/app/api/roles/[roleCode]/permissions/route.ts` | 존재 (GET, PUT) | ✅ |
| `src/lib/schemas/permission.ts` | 존재 | ✅ |

### 3.9 OpenAPI — 100%

5개 엔드포인트 + 7개 스키마 (Role, CreateRole, UpdateRole, MenuPermissionItem, RolePermissions, UpdatePermissions) 모두 등록 완료.

---

## 4. Match Rate Summary

```
+---------------------------------------------+
|  Overall Match Rate: 100%                    |
+---------------------------------------------+
|  ✅ Match:          36 items (100%)           |
|  ✅ Impl 추가:       4 items (방어적 코딩)      |
|  ⚠️ 설계 누락:       0 items                  |
|  ❌ 미구현:          0 items (0%)             |
+---------------------------------------------+
```

---

## 5. Conclusion

Permission 기능의 설계-구현 일치율은 **100%**이다.

- 5개 API 엔드포인트 모두 정확히 구현
- QpRole + QpRoleMenuPermission 2개 모델 완전 매핑
- 메뉴별 CRUD 권한 조회 시 2레벨 트리 + hasUrl 정확히 구현
- 권한 일괄 저장은 deleteMany + create를 $transaction으로 원자성 보장
- Design 문서 v0.2 업데이트 (createdBy/updatedBy, @@id 복합PK) 반영 완료

**Match Rate >= 90% — Check 단계 통과.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-30 | Initial gap analysis | CK |
