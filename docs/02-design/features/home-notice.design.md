# 홈화면 공지 관리 API Design Document

> **Summary**: 게시대상별/기간별 홈화면 공지 CRUD API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [home-notice.plan.md](../../01-plan/features/home-notice.plan.md)

---

## 1. Data Model (Prisma — 기존)

```
HomeNotice (qp_home_notices)
├── id: Int (PK, auto)
├── targetSuperAdmin: Boolean (default: false)
├── targetAdmin: Boolean (default: false)
├── targetFirstDealer: Boolean (default: false)
├── targetSecondDealer: Boolean (default: false)
├── targetConstructor: Boolean (default: false)
├── targetGeneral: Boolean (default: false)
├── startAt: DateTime
├── endAt: DateTime
├── content: String (Text)
├── url: String? (500)
├── userType: UserType (ADMIN|DEALER|SEKO|GENERAL)
├── userId: String (255)
├── createdAt: DateTime
├── createdBy: String? (255)
├── updatedAt: DateTime
├── updatedBy: String? (255)
```

> **Note**: `status` 컬럼은 DB에 존재하지 않음. `startAt`/`endAt`과 현재 시각을 비교하는 동적(computed) 값으로만 사용.

---

## 2. API Specification

### `GET /api/home-notices` — 공지 목록 (관리자용)

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `keyword` | string | — | 공지내용 Like 검색 |
| `status` | string | — | scheduled/active/ended (콤마 구분 복수 가능) |
| `targetType` | string | — | 게시대상 필터 |
| `startDate` | string | — | 등록일 시작 |
| `endDate` | string | — | 등록일 종료 |

**비즈니스 로직:**
- status는 DB 값이 아닌 현재 시각 기준 동적 판별
  - `now < startAt` → scheduled
  - `startAt <= now <= endAt` → active
  - `now > endAt` → ended
- 관리자만 접근 가능

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "targets": ["first_dealer", "second_dealer", "constructor"],
      "content": "【Qセルズ】情報連絡シート掲載のお知らせ2026年3月9日",
      "url": null,
      "startAt": "2026-03-09",
      "endAt": "2026-03-15",
      "status": "active",
      "authorName": "金志映 (1301000)",
      "createdAt": "2026-03-09",
      "updaterName": "Interplug",
      "updatedAt": "2026-03-09"
    }
  ]
}
```

### `POST /api/home-notices` — 공지 등록

**Request Body:**
```json
{
  "targetSuperAdmin": true,
  "targetAdmin": false,
  "targetFirstDealer": true,
  "targetSecondDealer": false,
  "targetConstructor": false,
  "targetGeneral": false,
  "startAt": "2026-03-20",
  "endAt": "2026-03-30",
  "content": "공지 내용 텍스트",
  "url": "https://example.com"
}
```

**비즈니스 로직:**
- 게시대상 최소 1개 이상 체크 필수
- 활성(scheduled + active) 공지 5개 초과 시 등록 불가 → 400
- userType, userId 헤더에서 추출
- status는 DB에 저장되지 않음 — 조회 시 startAt/endAt과 현재 시각 비교로 동적 산출 (computed field)

### `PUT /api/home-notices/[id]` — 공지 수정

**수정 가능:** 전체 필드 (게시대상, 기간, 내용, URL)
**자동 업데이트:** updatedBy, updatedAt

### `DELETE /api/home-notices/[id]` — 공지 삭제

물리 삭제

### `GET /api/home-notices/active` — 홈화면용 활성 공지

**인증:** Optional (비회원도 조회 가능)

**비즈니스 로직:**
- 현재 시각이 startAt~endAt 범위 내인 공지만
- 현재 사용자의 역할(role)에 해당하는 target이 true인 공지만
- 비회원: targetGeneral이 true인 것 (비회원 target 별도 없으므로 general 포함)
- 최신 등록순 정렬

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "content": "공지 내용",
      "url": "https://example.com"
    }
  ]
}
```

---

## 3. Zod Schemas

파일: `src/lib/schemas/home-notice.ts`

```typescript
export const createHomeNoticeSchema = z.object({
  targetSuperAdmin: z.boolean().default(false),
  targetAdmin: z.boolean().default(false),
  targetFirstDealer: z.boolean().default(false),
  targetSecondDealer: z.boolean().default(false),
  targetConstructor: z.boolean().default(false),
  targetGeneral: z.boolean().default(false),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  content: z.string().min(1),
  url: z.string().url().max(500).nullable().default(null),
}).refine(data => {
  return data.targetSuperAdmin || data.targetAdmin || data.targetFirstDealer ||
    data.targetSecondDealer || data.targetConstructor || data.targetGeneral
}, { message: '게시대상을 최소 1개 이상 선택하세요' })

export const updateHomeNoticeSchema = createHomeNoticeSchema.partial()
```

---

## 4. File Structure

```
src/app/api/home-notices/
├── route.ts              # GET (목록), POST (등록)
├── [id]/
│   └── route.ts          # PUT (수정), DELETE (삭제)
└── active/
    └── route.ts          # GET (홈화면용 활성 공지)
src/lib/schemas/
└── home-notice.ts
```

---

## 5. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/home-notice.ts` |
| 2 | 목록 + 등록 | `src/app/api/home-notices/route.ts` |
| 3 | 수정 + 삭제 | `src/app/api/home-notices/[id]/route.ts` |
| 4 | 홈화면용 활성 공지 | `src/app/api/home-notices/active/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
