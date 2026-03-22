# 카테고리 관리 API Design Document

> **Summary**: 2Depth 트리형 카테고리 CRUD API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [category.plan.md](../../01-plan/features/category.plan.md)

---

## 1. Data Model (Prisma — 기존)

```
Category (categories)
├── id: Int (PK, auto)
├── parentId: Int? (FK → self, null=1Depth)
├── categoryCode: String (unique, 50)
├── name: String (100)
├── isInternalOnly: Boolean (default: false)
├── sortOrder: Int (default: 1)
├── isActive: Boolean (default: true)
├── createdAt / updatedAt
├── parent: Category? (self-relation)
├── children: Category[]
└── contents: ContentCategory[]
```

---

## 2. API Specification

### `GET /api/categories` — 트리 목록

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `internalOnly` | boolean | false | true=사내전용만, false=전체 |
| `activeOnly` | boolean | true | 사용여부 Y인 것만 |

**비즈니스 로직:**
- 1Depth(parentId=null) 조회 후, 각 1Depth 하위 children include
- sortOrder 순 정렬
- 사내전용 필터: isInternalOnly=true인 카테고리만

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "categoryCode": "PROD",
      "name": "상품분류",
      "isInternalOnly": false,
      "sortOrder": 1,
      "isActive": true,
      "children": [
        {
          "id": 2,
          "categoryCode": "CTE001",
          "name": "太陽光モジュール",
          "isInternalOnly": true,
          "sortOrder": 1,
          "isActive": true
        }
      ]
    }
  ]
}
```

### `POST /api/categories` — 등록

**Request Body:**
```json
{
  "parentId": null,
  "categoryCode": "PROD",
  "name": "상품분류",
  "isInternalOnly": false,
  "sortOrder": 1,
  "isActive": true
}
```

**비즈니스 로직:**
- categoryCode 중복 체크 → 409 Conflict
- parentId가 있으면 2Depth, 없으면 1Depth
- 2Depth 최대까지만 허용 (parent의 parentId가 not null이면 거부)

### `PUT /api/categories/[id]` — 수정

**수정 불가 필드:** `categoryCode`, `parentId`
**수정 가능:** `name`, `isInternalOnly`, `sortOrder`, `isActive`

### `DELETE /api/categories/[id]` — 삭제

**비즈니스 로직:**
- 하위 카테고리가 있으면 삭제 불가 (400)
- ContentCategory에 연결된 콘텐츠가 있으면 삭제 불가 (400)
- 물리 삭제

---

## 3. Zod Schemas

파일: `src/lib/schemas/category.ts`

```typescript
export const createCategorySchema = z.object({
  parentId: z.number().int().positive().nullable().default(null),
  categoryCode: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  isInternalOnly: z.boolean().default(false),
  sortOrder: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
})

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isInternalOnly: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
})
```

---

## 4. File Structure

```
src/app/api/categories/
├── route.ts              # GET (목록), POST (등록)
└── [id]/
    └── route.ts          # PUT (수정), DELETE (삭제)
src/lib/schemas/
└── category.ts           # Zod schemas
```

---

## 5. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/category.ts` |
| 2 | 목록 + 등록 | `src/app/api/categories/route.ts` |
| 3 | 수정 + 삭제 | `src/app/api/categories/[id]/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
