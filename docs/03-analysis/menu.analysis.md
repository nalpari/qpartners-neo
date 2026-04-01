# Menu Gap Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: qpartners-neo
> **Analyst**: CK
> **Date**: 2026-03-30
> **Design Doc**: [menu.design.md](../02-design/features/menu.design.md)
> **Plan Doc**: [menu.plan.md](../01-plan/features/menu.plan.md)

---

## 1. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| API Endpoints Match | 100% | ✅ |
| Data Model Match | 88% | ⚠️ |
| Zod Schema Match | 100% | ✅ |
| File Structure Match | 100% | ✅ |
| Business Logic Match | 100% | ✅ |
| OpenAPI Spec Match | 100% | ✅ |
| **Overall** | **97%** | **✅** |

---

## 2. API Endpoints — 100% (4/4)

| Endpoint | Design | Implementation | Status |
|----------|:------:|:--------------:|--------|
| GET /api/menus | O | O | ✅ Match |
| POST /api/menus | O | O | ✅ Match |
| PUT /api/menus/[id] | O | O | ✅ Match |
| PUT /api/menus/sort | O | O | ✅ Match |

---

## 3. Detailed Comparison

### 3.1 GET /api/menus — 트리 목록

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Query: activeOnly | boolean, default true | `searchParams.get("activeOnly") !== "false"` | ✅ Match |
| 1-Level (parentId=null) | O | `where: { parentId: null }` | ✅ Match |
| children include | O | `include: { children: { where, orderBy } }` | ✅ Match |
| sortOrder asc | O | `orderBy: { sortOrder: "asc" }` (부모+자식) | ✅ Match |
| activeOnly 필터 | O | 부모+자식 모두 적용 | ✅ Match |
| Response format | `{ data: [...] }` | `NextResponse.json({ data: menus })` | ✅ Match |

### 3.2 POST /api/menus — 등록

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Zod validation | createMenuSchema | `createMenuSchema.safeParse(body)` | ✅ Match |
| menuCode 중복 409 | O | Prisma P2002 catch → 409 | ✅ Match |
| parentId 2레벨 제한 | O | parent 조회 후 parentId 체크 → 400 | ✅ Match |
| parentId 미존재 404 | (implied) | parent 미존재 시 404 | ✅ 추가 |
| Response 201 | O | `{ data: menu }, { status: 201 }` | ✅ Match |

### 3.3 PUT /api/menus/[id] — 수정

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| menuCode 수정 불가 | O | updateMenuSchema에 미포함 | ✅ Match |
| 수정 가능 6필드 | menuName, pageUrl, isActive, showInTopNav, showInMobile, sortOrder | 6개 모두 optional | ✅ Match |
| ID 검증 | - | idParamSchema | ✅ 추가 |
| 빈 body 체크 | - | 400 반환 | ✅ 추가 |
| Not found 404 | - | P2025 catch | ✅ 추가 |

### 3.4 PUT /api/menus/sort — 정렬 일괄 저장

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Zod validation | sortMenuSchema | `sortMenuSchema.safeParse(body)` | ✅ Match |
| 트랜잭션 일괄 업데이트 | O | `prisma.$transaction(items.map(...))` | ✅ Match |
| Response format | - | `{ data: { updated: count } }` | ✅ |

### 3.5 Zod Schemas

| Schema | Design | Implementation | Status |
|--------|--------|---------------|--------|
| createMenuSchema (8필드) | 정의 일치 | 동일 + error message | ✅ Match |
| updateMenuSchema | `createMenuSchema.omit({...}).partial()` | explicit `z.object({...})` | ✅ 동등 |
| sortMenuSchema | `z.array(z.object({id, sortOrder})).min(1)` | 동일 | ✅ Match |

### 3.6 File Structure — 100%

| Design | Implementation | Status |
|--------|---------------|--------|
| `src/app/api/menus/route.ts` | 존재 (GET, POST) | ✅ |
| `src/app/api/menus/[id]/route.ts` | 존재 (PUT) | ✅ |
| `src/app/api/menus/sort/route.ts` | 존재 (PUT) | ✅ |
| `src/lib/schemas/menu.ts` | 존재 | ✅ |

### 3.7 Data Model (Prisma vs Design)

| Field | Design | Prisma | Status |
|-------|--------|--------|--------|
| id~sortOrder (9필드) | O | 일치 | ✅ Match |
| createdAt / updatedAt | O | O | ✅ Match |
| **createdBy** | **미설계** | `String?` | ⚠️ 설계 누락 |
| **updatedBy** | **미설계** | `String?` | ⚠️ 설계 누락 |
| parent/children/permissions | O | O | ✅ Match |

### 3.8 OpenAPI Spec — 100%

4개 엔드포인트 + 6개 스키마 (Menu, MenuTree, CreateMenu, UpdateMenu, SortMenu) 모두 등록 완료.

---

## 4. Match Rate Summary

```
+---------------------------------------------+
|  Overall Match Rate: 97%                     |
+---------------------------------------------+
|  ✅ Match:          33 items (87%)            |
|  ✅ Impl 추가:       5 items (13%)            |
|  ⚠️ 설계 누락:       2 items (createdBy/updatedBy) |
|  ❌ 미구현:          0 items (0%)             |
+---------------------------------------------+
```

---

## 5. Conclusion

- 설계된 4개 API 엔드포인트 모두 정확히 구현
- 비즈니스 로직 (2레벨 제한, menuCode 중복/불변, 트랜잭션 정렬) 완전 구현
- updateMenuSchema는 Design의 `.omit().partial()` 대신 explicit 정의 — 기능적으로 동등
- createdBy/updatedBy는 프로젝트 공통 패턴으로 Design 역반영만 필요

**Match Rate >= 90% — Check 단계 통과.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-30 | Initial gap analysis | CK |
