# 메뉴 관리 API Design Document

> **Summary**: 2레벨 메뉴 CRUD + 정렬/노출 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [menu.plan.md](../../01-plan/features/menu.plan.md)

---

## 1. Data Model (Prisma — 기존)

```
Menu (qp_menus)
├── id: Int (PK, auto)
├── parentId: Int? (FK → self, null=1-Level)
├── menuCode: String (unique, 50) — 수정 불가
├── menuName: String (100)
├── pageUrl: String? (500)
├── isActive: Boolean (default: true)
├── showInTopNav: Boolean (default: true)
├── showInMobile: Boolean (default: true)
├── sortOrder: Int (default: 1)
├── createdAt / updatedAt
├── parent: Menu? (self-relation)
├── children: Menu[]
└── permissions: QpRoleMenuPermission[]
```

---

## 2. API Specification

### `GET /api/menus` — 트리 목록

**Query:** `activeOnly` (boolean, default: true)

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "menuCode": "SEARCH",
      "menuName": "통합검색",
      "pageUrl": null,
      "isActive": true,
      "showInTopNav": true,
      "showInMobile": true,
      "sortOrder": 1,
      "children": [...]
    }
  ]
}
```

### `POST /api/menus` — 등록

**Request Body:**
```json
{
  "parentId": null,
  "menuCode": "CONTENT",
  "menuName": "콘텐츠",
  "pageUrl": "/contents",
  "isActive": true,
  "showInTopNav": true,
  "showInMobile": true,
  "sortOrder": 2
}
```

**비즈니스 로직:**
- menuCode 중복 체크 → 409
- parentId 있으면 2-Level, 없으면 1-Level
- 2레벨까지만 허용

### `PUT /api/menus/[id]` — 수정

**수정 불가:** `menuCode`
**수정 가능:** `menuName`, `pageUrl`, `isActive`, `showInTopNav`, `showInMobile`, `sortOrder`

### `PUT /api/menus/sort` — 정렬순서 일괄 저장

**Request Body:**
```json
{
  "items": [
    { "id": 1, "sortOrder": 1 },
    { "id": 2, "sortOrder": 2 },
    { "id": 3, "sortOrder": 3 }
  ]
}
```

**비즈니스 로직:** 트랜잭션으로 일괄 업데이트

---

## 3. Zod Schemas

파일: `src/lib/schemas/menu.ts`

```typescript
export const createMenuSchema = z.object({
  parentId: z.number().int().positive().nullable().default(null),
  menuCode: z.string().min(1).max(50),
  menuName: z.string().min(1).max(100),
  pageUrl: z.string().max(500).nullable().default(null),
  isActive: z.boolean().default(true),
  showInTopNav: z.boolean().default(true),
  showInMobile: z.boolean().default(true),
  sortOrder: z.number().int().positive().default(1),
})

export const updateMenuSchema = createMenuSchema.omit({ menuCode: true, parentId: true }).partial()

export const sortMenuSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive(),
    sortOrder: z.number().int().positive(),
  })).min(1),
})
```

---

## 4. File Structure

```
src/app/api/menus/
├── route.ts              # GET (목록), POST (등록)
├── [id]/
│   └── route.ts          # PUT (수정)
└── sort/
    └── route.ts          # PUT (정렬 일괄 저장)
src/lib/schemas/
└── menu.ts
```

---

## 5. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/menu.ts` |
| 2 | 목록 + 등록 | `src/app/api/menus/route.ts` |
| 3 | 수정 | `src/app/api/menus/[id]/route.ts` |
| 4 | 정렬 일괄 저장 | `src/app/api/menus/sort/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
