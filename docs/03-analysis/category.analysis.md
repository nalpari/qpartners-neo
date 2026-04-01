# Category Gap Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: qpartners-neo
> **Analyst**: CK
> **Date**: 2026-03-30
> **Design Doc**: [category.design.md](../02-design/features/category.design.md)
> **Plan Doc**: [category.plan.md](../01-plan/features/category.plan.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Design Document(category.design.md)와 실제 구현 코드 간의 일치도를 검증하여, PDCA Check 단계를 수행한다.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/category.design.md`
- **Implementation Files**:
  - `src/lib/schemas/category.ts`
  - `src/app/api/categories/route.ts`
  - `src/app/api/categories/[id]/route.ts`
  - `src/lib/openapi.ts` (Category sections)
  - `prisma/schema.prisma` (Category model)
- **Analysis Date**: 2026-03-30

---

## 2. Overall Scores

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

## 3. Gap Analysis (Design vs Implementation)

### 3.1 API Endpoints

| Endpoint | Design | Implementation | Status |
|----------|--------|---------------|--------|
| GET /api/categories | O | O | ✅ Match |
| POST /api/categories | O | O | ✅ Match |
| PUT /api/categories/[id] | O | O | ✅ Match |
| DELETE /api/categories/[id] | O | O | ✅ Match |

**4/4 endpoints implemented. 100% match.**

### 3.2 GET /api/categories — 트리 목록

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Query: internalOnly | boolean, default false | `searchParams.get("internalOnly") === "true"` | ✅ Match |
| Query: activeOnly | boolean, default true | `searchParams.get("activeOnly") !== "false"` | ✅ Match |
| 1Depth 조회 (parentId=null) | O | `where: { parentId: null }` | ✅ Match |
| children include | O | `include: { children: { ... } }` | ✅ Match |
| sortOrder 정렬 | O | `orderBy: { sortOrder: "asc" }` (부모+자식 모두) | ✅ Match |
| internalOnly 필터 | isInternalOnly=true만 | `...(internalOnly && { isInternalOnly: true })` | ✅ Match |
| activeOnly 필터 | isActive=true만 | `...(activeOnly && { isActive: true })` (부모+자식 모두) | ✅ Match |
| Response format | `{ data: [...] }` | `NextResponse.json({ data: categories })` | ✅ Match |

### 3.3 POST /api/categories — 등록

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| Request body validation | Zod createCategorySchema | `createCategorySchema.safeParse(body)` | ✅ Match |
| categoryCode 중복 409 | O | Prisma P2002 catch → 409 | ✅ Match |
| parentId 2Depth 제한 | parent.parentId !== null 이면 거부 | parent 조회 후 parentId 체크 → 400 | ✅ Match |
| parentId 존재 확인 | (implied) | parent 미존재 시 404 반환 | ✅ Match (추가 안전장치) |
| Response 201 | O | `{ data: category }, { status: 201 }` | ✅ Match |
| Invalid JSON 처리 | - | try/catch → 400 "Invalid JSON body" | ✅ 추가 안전장치 |

### 3.4 PUT /api/categories/[id] — 수정

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| 수정 불가: categoryCode, parentId | O | updateCategorySchema에 해당 필드 미포함 | ✅ Match |
| 수정 가능: name, isInternalOnly, sortOrder, isActive | O | updateCategorySchema에 4개 필드 optional | ✅ Match |
| ID 검증 | - | idParamSchema.safeParse(id) | ✅ 추가 안전장치 |
| 빈 body 체크 | - | `Object.keys(result.data).length === 0` → 400 | ✅ 추가 안전장치 |
| Not found 404 | - | Prisma P2025 catch → 404 | ✅ 추가 안전장치 |

### 3.5 DELETE /api/categories/[id] — 삭제

| Item | Design | Implementation | Status |
|------|--------|---------------|--------|
| 하위 카테고리 존재 시 400 | O | `prisma.category.count({ where: { parentId } })` → 400 | ✅ Match |
| ContentCategory 연결 시 400 | O | `prisma.contentCategory.count({ where: { categoryId } })` → 400 | ✅ Match |
| 물리 삭제 | O | `prisma.category.delete()` | ✅ Match |
| Response format | - | `{ data: { id } }` | ✅ |

### 3.6 Zod Schemas

| Schema | Design | Implementation | Status |
|--------|--------|---------------|--------|
| createCategorySchema.parentId | `z.number().int().positive().nullable().default(null)` | 동일 | ✅ Match |
| createCategorySchema.categoryCode | `z.string().min(1).max(50)` | 동일 + error message | ✅ Match |
| createCategorySchema.name | `z.string().min(1).max(100)` | 동일 + error message | ✅ Match |
| createCategorySchema.isInternalOnly | `z.boolean().default(false)` | 동일 | ✅ Match |
| createCategorySchema.sortOrder | `z.number().int().positive().default(1)` | 동일 | ✅ Match |
| createCategorySchema.isActive | `z.boolean().default(true)` | 동일 | ✅ Match |
| updateCategorySchema.name | `z.string().min(1).max(100).optional()` | 동일 + error message | ✅ Match |
| updateCategorySchema.isInternalOnly | `z.boolean().optional()` | 동일 | ✅ Match |
| updateCategorySchema.sortOrder | `z.number().int().positive().optional()` | 동일 | ✅ Match |
| updateCategorySchema.isActive | `z.boolean().optional()` | 동일 | ✅ Match |
| idParamSchema | 미설계 | 구현에 추가 | ⚠️ 미설계 (개선 사항) |

### 3.7 File Structure

| Design | Implementation | Status |
|--------|---------------|--------|
| `src/app/api/categories/route.ts` | 존재 (GET, POST) | ✅ Match |
| `src/app/api/categories/[id]/route.ts` | 존재 (PUT, DELETE) | ✅ Match |
| `src/lib/schemas/category.ts` | 존재 | ✅ Match |

### 3.8 Data Model (Prisma vs Design)

| Field | Design | Prisma Schema | Status |
|-------|--------|--------------|--------|
| id | Int (PK, auto) | `Int @id @default(autoincrement())` | ✅ Match |
| parentId | Int? (FK → self) | `Int? @map("parent_id")` | ✅ Match |
| categoryCode | String (unique, 50) | `String @unique @db.VarChar(50)` | ✅ Match |
| name | String (100) | `String @db.VarChar(100)` | ✅ Match |
| isInternalOnly | Boolean (default: false) | `Boolean @default(false)` | ✅ Match |
| sortOrder | Int (default: 1) | `Int @default(1)` | ✅ Match |
| isActive | Boolean (default: true) | `Boolean @default(true)` | ✅ Match |
| createdAt | O | `DateTime @default(now())` | ✅ Match |
| updatedAt | O | `DateTime @updatedAt` | ✅ Match |
| **createdBy** | **미설계** | `String? @db.VarChar(255)` | ⚠️ 설계 누락 |
| **updatedBy** | **미설계** | `String? @db.VarChar(255)` | ⚠️ 설계 누락 |
| parent (relation) | O | `@relation("CategoryTree")` | ✅ Match |
| children (relation) | O | `@relation("CategoryTree")` | ✅ Match |
| contents (relation) | O | `ContentCategory[]` | ✅ Match |

### 3.9 OpenAPI Spec

| Endpoint | OpenAPI 등록 | Parameters/Schema 정확성 | Status |
|----------|:-----------:|:----------------------:|--------|
| GET /api/categories | O | internalOnly, activeOnly, CategoryTree response | ✅ Match |
| POST /api/categories | O | CreateCategory schema, 201/400/404/409/500 responses | ✅ Match |
| PUT /api/categories/{id} | O | UpdateCategory schema, path param, 200/400/404/500 | ✅ Match |
| DELETE /api/categories/{id} | O | path param, 200/400/404/500 | ✅ Match |

---

## 4. Match Rate Summary

```
+---------------------------------------------+
|  Overall Match Rate: 97%                     |
+---------------------------------------------+
|  ✅ Match:          31 items (89%)            |
|  ✅ Impl 추가:       4 items (11%)            |
|     (idParamSchema, empty body check,        |
|      invalid JSON handling, not found 404)   |
|  ⚠️ 설계 누락:       4 items                  |
|     (createdBy, updatedBy, 2 indexes)        |
|  ❌ 미구현:          0 items (0%)             |
+---------------------------------------------+
```

---

## 5. Differences Found

### 5.1 Missing Features (Design O, Implementation X)

**없음.** 설계된 모든 기능이 구현되어 있음.

### 5.2 Added Features (Design X, Implementation O)

| # | Item | Location | Description |
|---|------|----------|-------------|
| 1 | idParamSchema | `schemas/category.ts` | URL path ID 파라미터 검증용 Zod schema |
| 2 | Empty body check | `[id]/route.ts` | PUT 요청 시 빈 body 체크 → 400 |
| 3 | Invalid JSON handling | `categories/route.ts` | POST 요청 시 JSON 파싱 실패 처리 |
| 4 | Parent not found 404 | `categories/route.ts` | parentId에 해당하는 카테고리 미존재 시 404 |

### 5.3 Design Document Gaps (Prisma에 있으나 Design에 누락)

| # | Item | Description |
|---|------|-------------|
| 1 | createdBy | 생성자 필드 (String?, VarChar 255) |
| 2 | updatedBy | 수정자 필드 (String?, VarChar 255) |
| 3 | idx_parent_id | parentId 인덱스 |
| 4 | idx_active_sort | isActive+sortOrder 복합 인덱스 |

---

## 6. Conclusion

Category 기능의 설계-구현 일치율은 **97%**로, 매우 높은 수준이다.

- 설계된 4개 API 엔드포인트가 모두 정확히 구현됨
- Zod 스키마가 설계 사양과 정확히 일치
- 비즈니스 로직 (2Depth 제한, 중복체크, 삭제 제약) 모두 정확히 구현
- OpenAPI 문서가 모든 엔드포인트를 커버
- 구현에서 추가된 방어 로직들은 설계 문서에 역반영만 하면 됨

**Match Rate >= 90% — Check 단계 통과.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-30 | Initial gap analysis | CK |
