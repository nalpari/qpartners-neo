# 코드 관리 API Design Document

> **Summary**: Header Code + Code Detail 2단계 공통코드 CRUD API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [code.plan.md](../../01-plan/features/code.plan.md)

---

## 1. Data Model (Prisma — 기존)

```
CodeHeader (code_headers)
├── id: Int (PK, auto)
├── headerCode: String (unique, 20) — 수정 불가
├── headerId: String (50)
├── headerName: String (255)
├── relCode1~3: String? (50)
├── relNum1~3: Decimal? (15,2)
├── isActive: Boolean (default: true)
├── createdAt / updatedAt
└── details: CodeDetail[]

CodeDetail (code_details)
├── id: Int (PK, auto)
├── headerId: Int (FK → CodeHeader)
├── code: String (20)
├── displayCode: String (20)
├── codeName: String (255)
├── codeNameEtc: String? (255)
├── relCode1~2: String? (50)
├── relNum1: Decimal? (15,2)
├── sortOrder: Int (default: 0)
├── isActive: Boolean (default: true)
├── createdAt / updatedAt
└── @@unique([headerId, code])
```

---

## 2. API Specification

### `GET /api/codes` — Header Code 목록

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `keyword` | string | — | headerCode 또는 headerName Like 검색 |
| `activeOnly` | boolean | true | 사용여부 Y만 |

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "headerCode": "100300",
      "headerId": "STAT_CD",
      "headerName": "Status",
      "relCode1": null,
      "isActive": true
    }
  ]
}
```

### `POST /api/codes` — Header Code 등록

**Request Body:**
```json
{
  "headerCode": "100300",
  "headerId": "STAT_CD",
  "headerName": "Status",
  "relCode1": null,
  "relCode2": null,
  "relCode3": null,
  "relNum1": null,
  "relNum2": null,
  "relNum3": null,
  "isActive": true
}
```

### `PUT /api/codes/[id]` — Header Code 수정

**수정 불가:** `headerCode`
**수정 가능:** 나머지 전부

### `GET /api/codes/[id]/details` — Code Detail 목록

**Query:** `activeOnly` (boolean, default: true)
**정렬:** sortOrder ASC

### `POST /api/codes/[id]/details` — Code Detail 등록

**Request Body:**
```json
{
  "code": "01",
  "displayCode": "01",
  "codeName": "Admin",
  "codeNameEtc": "",
  "relCode1": null,
  "relCode2": null,
  "relNum1": null,
  "sortOrder": 1,
  "isActive": true
}
```

**중복 체크:** 동일 headerId 내에서 code 중복 불가

### `PUT /api/codes/[id]/details/[detailId]` — Code Detail 수정

### `DELETE /api/codes/[id]/details/[detailId]` — Code Detail 삭제

물리 삭제 (또는 isActive=false)

---

## 3. Zod Schemas

파일: `src/lib/schemas/code.ts`

```typescript
export const createCodeHeaderSchema = z.object({
  headerCode: z.string().min(1).max(20),
  headerId: z.string().min(1).max(50),
  headerName: z.string().min(1).max(255),
  relCode1: z.string().max(50).nullable().default(null),
  relCode2: z.string().max(50).nullable().default(null),
  relCode3: z.string().max(50).nullable().default(null),
  relNum1: z.number().nullable().default(null),
  relNum2: z.number().nullable().default(null),
  relNum3: z.number().nullable().default(null),
  isActive: z.boolean().default(true),
})

export const updateCodeHeaderSchema = createCodeHeaderSchema.omit({ headerCode: true }).partial()

export const createCodeDetailSchema = z.object({
  code: z.string().min(1).max(20),
  displayCode: z.string().min(1).max(20),
  codeName: z.string().min(1).max(255),
  codeNameEtc: z.string().max(255).nullable().default(null),
  relCode1: z.string().max(50).nullable().default(null),
  relCode2: z.string().max(50).nullable().default(null),
  relNum1: z.number().nullable().default(null),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

export const updateCodeDetailSchema = createCodeDetailSchema.partial()
```

---

## 4. File Structure

```
src/app/api/codes/
├── route.ts                          # GET (목록), POST (등록)
└── [id]/
    ├── route.ts                      # PUT (수정)
    └── details/
        ├── route.ts                  # GET (Detail 목록), POST (Detail 등록)
        └── [detailId]/
            └── route.ts             # PUT (Detail 수정), DELETE (Detail 삭제)
src/lib/schemas/
└── code.ts
```

---

## 5. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/code.ts` |
| 2 | Header 목록 + 등록 | `src/app/api/codes/route.ts` |
| 3 | Header 수정 | `src/app/api/codes/[id]/route.ts` |
| 4 | Detail 목록 + 등록 | `src/app/api/codes/[id]/details/route.ts` |
| 5 | Detail 수정 + 삭제 | `src/app/api/codes/[id]/details/[detailId]/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
