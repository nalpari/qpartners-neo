# 콘텐츠 CRUD API Design Document

> **Summary**: Q.PARTNERS 콘텐츠 관리 API 상세 설계 — 엔드포인트, 데이터 모델, 비즈니스 로직, 파일 구조
>
> **Project**: qpartners-neo
> **Version**: 0.1.0
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [content.plan.md](../../01-plan/features/content.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 화면설계서 v1.0 (p.22~31) 기능을 충실히 반영하는 REST API 설계
- 기존 Prisma 모델(Content, ContentTarget 등 5개)을 그대로 활용
- 인증 미구현 상태에서도 동작하는 임시 인증 헤더 기반 접근제어
- 프로젝트 첫 도메인 API로서 컨벤션 확립 (응답 포맷, 에러 처리, 파일 구조)

### 1.2 Design Principles

- Route Handler에서 직접 Prisma 호출 (별도 서비스 레이어 불필요)
- 모든 입력은 Zod safeParse로 검증
- 응답 포맷 일관성: `{ data, meta? }` / `{ error, message }`
- `any` 금지, TypeScript strict 준수

---

## 2. Architecture

### 2.1 Component Diagram

```
Client (Browser/REST Client)
    │
    ▼
Next.js Route Handler (src/app/api/contents/)
    │
    ├── Zod Validation (src/lib/schemas/content.ts)
    ├── Auth Helper (src/lib/auth.ts) ← 임시 헤더 파싱
    │
    ▼
Prisma Client (src/lib/prisma.ts)
    │
    ▼
MariaDB 11 (qp_contents, qp_content_targets, qp_content_categories, qp_content_attachments, qp_download_logs)
```

### 2.2 Data Flow

```
Request → 헤더에서 사용자 정보 추출 → Zod 입력 검증 → 접근제어 체크 → Prisma CRUD → Response
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| Route Handler | Prisma, Zod, Auth Helper | API 로직 |
| Auth Helper | Request Headers | 임시 사용자 식별 |
| Zod Schemas | — | 입력 검증 |
| Prisma Client | MariaDB | 데이터 접근 |

---

## 3. Data Model

### 3.1 Prisma 모델 (이미 생성됨)

```
Content (qp_contents)
├── id: Int (PK, auto)
├── authorSource: UserSource (qsp|seko|general)
├── authorId: String(255)
├── authorDepartment: String?(100)
├── updaterSource: UserSource?
├── updaterId: String?(255)
├── approverLevel: Int? (TinyInt)
├── title: String(500)
├── body: String? (MediumText)
├── status: ContentStatus (draft|published|deleted)
├── publishedAt: DateTime?
├── createdAt: DateTime
├── updatedAt: DateTime
├── viewCount: Int (default: 0)
│
├── targets: ContentTarget[]
├── categories: ContentCategory[]
├── attachments: ContentAttachment[]
└── downloadLogs: DownloadLog[]

ContentTarget (qp_content_targets)
├── id: Int (PK)
├── contentId: Int (FK → Content)
├── targetType: TargetType (first_dealer|second_dealer|constructor|general|non_member)
├── startAt: DateTime?
└── endAt: DateTime?

ContentCategory (qp_content_categories)
├── contentId: Int (FK → Content, composite PK)
└── categoryId: Int (FK → Category, composite PK)

ContentAttachment (qp_content_attachments)
├── id: Int (PK)
├── contentId: Int (FK → Content)
├── fileName: String(255)
├── filePath: String(500)
├── fileSize: BigInt?
├── mimeType: String?(100)
├── sortOrder: Int (default: 0)
└── createdAt: DateTime

DownloadLog (qp_download_logs)
├── id: Int (PK)
├── userSource: UserSource
├── externalUserId: String(255)
├── contentId: Int (FK → Content)
├── attachmentId: Int (FK → ContentAttachment)
└── downloadedAt: DateTime
```

### 3.2 Entity Relationships

```
Content 1 ──── N ContentTarget (게시대상별 기간)
Content N ──── M Category (via ContentCategory)
Content 1 ──── N ContentAttachment (첨부파일)
Content 1 ──── N DownloadLog (다운로드 기록)
ContentAttachment 1 ──── N DownloadLog
```

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth | FR |
|--------|------|-------------|------|-----|
| GET | `/api/contents` | 콘텐츠 목록 조회 | Optional | FR-01~04, FR-15~16 |
| POST | `/api/contents` | 콘텐츠 등록 | Required (admin) | FR-05~08 |
| GET | `/api/contents/[id]` | 콘텐츠 상세 조회 | Optional | FR-09~10 |
| PUT | `/api/contents/[id]` | 콘텐츠 수정 | Required (admin) | FR-11 |
| DELETE | `/api/contents/[id]` | 콘텐츠 삭제 | Required (admin) | FR-12 |
| POST | `/api/contents/[id]/files` | 첨부파일 업로드 | Required (admin) | FR-13 |
| GET | `/api/contents/[id]/files/[fileId]/download` | 첨부파일 다운로드 | Optional | FR-10 |
| GET | `/api/download-logs` | 다운로드 기록 조회 | Required | FR-14 |

### 4.2 임시 인증 헤더

```
X-User-Source: qsp | seko | general     (필수 — 사용자 소스)
X-User-Id: string                        (필수 — 외부 사용자 ID)
X-User-Role: string                      (필수 — 권한)
X-User-Department: string                (선택 — 담당부문, 관리자만)
```

역할(Role) 값:

| Role | 설명 | 관리자여부 |
|------|------|-----------|
| `super_admin` | 슈퍼관리자 | Y (사내) |
| `admin` | 관리자 | Y (사내) |
| `first_dealer` | 1차 판매점 | N |
| `second_dealer` | 2차 이하 판매점 | N |
| `constructor` | 시공점 | N |
| `general` | 일반회원 | N |
| `non_member` | 비회원 | N |

### 4.3 공통 응답 포맷

**성공 (단건):**
```json
{
  "data": { ... }
}
```

**성공 (목록):**
```json
{
  "data": [ ... ],
  "meta": {
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "totalPages": 8
  }
}
```

**에러:**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "title is required",
  "details": [ ... ]
}
```

### 4.4 상세 API 스펙

---

#### `GET /api/contents` — 목록 조회

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | 페이지 번호 |
| `pageSize` | number | 20 | 페이지 크기 (20/50/100) |
| `keyword` | string | — | 제목+본문 Like 검색 |
| `categoryIds` | string | — | 카테고리 ID (콤마 구분, OR 필터) |
| `status` | string | published | draft/published/deleted (관리자만 draft/deleted 조회 가능) |
| `targetType` | string | — | 게시대상 필터 (관리자 전용) |
| `department` | string | — | 담당부문 필터 (관리자 전용) |
| `internalOnly` | boolean | false | 사내회원 게시글만 (관리자 전용) |
| `sort` | string | newest | newest/oldest/views/updated |

**비즈니스 로직:**
1. 비회원/일반회원: `status=published`만 조회
2. 게시대상 필터:
   - 사내회원(super_admin, admin): 게시대상 무관, 모든 콘텐츠 조회 가능
   - 그 외: 자신의 targetType에 해당하고, 현재 시각이 startAt~endAt 기간 내인 콘텐츠만
3. 사내전용 카테고리(isInternalOnly=true): 사내회원에게만 노출
4. New/Update 판별: 응답에 `isNew`(등록일 기준 5일), `isUpdated`(갱신일 기준 5일) 필드 포함

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "title": "2026年 新製品カタログ",
      "status": "published",
      "authorDepartment": "営業部",
      "viewCount": 42,
      "publishedAt": "2026-03-20T09:00:00Z",
      "createdAt": "2026-03-20T09:00:00Z",
      "updatedAt": "2026-03-20T09:00:00Z",
      "isNew": true,
      "isUpdated": false,
      "categories": [
        { "id": 1, "name": "製品資料", "categoryCode": "PROD", "isInternalOnly": false }
      ],
      "targets": [
        { "targetType": "first_dealer", "startAt": "2026-03-01", "endAt": "2026-12-31" }
      ],
      "attachmentCount": 3
    }
  ],
  "meta": { "total": 150, "page": 1, "pageSize": 20, "totalPages": 8 }
}
```

---

#### `POST /api/contents` — 등록

**Request Body:**
```json
{
  "title": "2026年 新製品カタログ",
  "body": "<p>HTML 본문...</p>",
  "status": "published",
  "publishedAt": "2026-03-20T09:00:00Z",
  "authorDepartment": "営業部",
  "approverLevel": 1,
  "targets": [
    { "targetType": "first_dealer", "startAt": "2026-03-01", "endAt": "2026-12-31" },
    { "targetType": "second_dealer", "startAt": "2026-03-01", "endAt": "2026-12-31" }
  ],
  "categoryIds": [1, 3, 7]
}
```

**비즈니스 로직:**
- `authorSource`, `authorId`는 헤더에서 추출
- `authorDepartment`는 요청 body 또는 헤더(X-User-Department)에서
- `publishedAt`은 status=published일 때 자동 설정 (미입력 시 현재 시각)
- 관리자(super_admin, admin)만 등록 가능

**Response (201):**
```json
{
  "data": {
    "id": 1,
    "title": "2026年 新製品カタログ",
    "status": "published",
    "createdAt": "2026-03-20T09:00:00Z"
  }
}
```

---

#### `GET /api/contents/[id]` — 상세 조회

**비즈니스 로직:**
- 조회수 +1 (동일 사용자 중복 카운트 허용, 단순 increment)
- 게시대상/기간 접근제어 적용 (목록 조회와 동일 규칙)
- categories, targets, attachments include

**Response (200):**
```json
{
  "data": {
    "id": 1,
    "title": "2026年 新製品カタログ",
    "body": "<p>HTML 본문...</p>",
    "status": "published",
    "authorSource": "qsp",
    "authorId": "NEW016610",
    "authorDepartment": "営業部",
    "updaterSource": null,
    "updaterId": null,
    "approverLevel": 1,
    "viewCount": 43,
    "publishedAt": "2026-03-20T09:00:00Z",
    "createdAt": "2026-03-20T09:00:00Z",
    "updatedAt": "2026-03-20T09:00:00Z",
    "isNew": true,
    "isUpdated": false,
    "categories": [ ... ],
    "targets": [ ... ],
    "attachments": [
      {
        "id": 1,
        "fileName": "catalog_2026.pdf",
        "fileSize": 2048000,
        "mimeType": "application/pdf",
        "sortOrder": 0
      }
    ]
  }
}
```

---

#### `PUT /api/contents/[id]` — 수정

**Request Body:** (등록과 동일 구조, 부분 업데이트 가능)

**비즈니스 로직:**
- `updaterSource`, `updaterId`는 헤더에서 자동 설정
- `authorSource`, `authorId`, `publishedAt`은 수정 불가 (무시)
- 권한 체크: 슈퍼관리자 또는 동일 부문 관리자만 수정 가능
- categoryIds 전달 시 기존 연결 삭제 후 새로 생성 (replace)
- targets 전달 시 기존 삭제 후 새로 생성 (replace)

**Response (200):**
```json
{
  "data": {
    "id": 1,
    "title": "Updated Title",
    "updatedAt": "2026-03-22T10:00:00Z"
  }
}
```

---

#### `DELETE /api/contents/[id]` — 삭제

**비즈니스 로직:**
- Soft delete: `status = 'deleted'`
- 슈퍼관리자: 동일 부문 게시글만 삭제 가능
- 일반 관리자: 본인이 등록한 게시글만 삭제 가능

**Response (200):**
```json
{
  "data": { "id": 1, "status": "deleted" }
}
```

---

#### `POST /api/contents/[id]/files` — 첨부파일 업로드

**Request:** `multipart/form-data`
- `files`: File[] (복수 파일)

**비즈니스 로직:**
- 파일 저장 경로: `public/uploads/contents/{contentId}/{timestamp}_{fileName}`
- DB에 메타데이터 저장 (fileName, filePath, fileSize, mimeType)
- 관리자만 업로드 가능

**Response (201):**
```json
{
  "data": [
    {
      "id": 10,
      "fileName": "catalog.pdf",
      "fileSize": 2048000,
      "mimeType": "application/pdf"
    }
  ]
}
```

---

#### `GET /api/contents/[id]/files/[fileId]/download` — 첨부파일 다운로드

**비즈니스 로직:**
- 게시대상 접근제어 적용
- DownloadLog에 기록 (userSource, externalUserId, contentId, attachmentId)
- 파일 스트리밍 응답 (Content-Disposition: attachment)

**Response:** Binary file stream

---

#### `GET /api/download-logs` — 다운로드 기록

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | 페이지 |
| `pageSize` | number | 20 | 페이지 크기 |
| `keyword` | string | — | 제목/자료명 Like 검색 |

**비즈니스 로직:**
- 현재 사용자(헤더)의 다운로드 기록만 조회
- Content join으로 제목, 상태 포함
- 삭제된 콘텐츠나 기간 만료 시 `isExpired: true` 플래그

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "contentId": 5,
      "contentTitle": "2026年 新製品カタログ",
      "contentStatus": "published",
      "fileName": "catalog.pdf",
      "downloadedAt": "2026-03-21T14:30:00Z",
      "isExpired": false
    }
  ],
  "meta": { "total": 25, "page": 1, "pageSize": 20, "totalPages": 2 }
}
```

---

## 5. Zod Schemas

### 5.1 파일: `src/lib/schemas/content.ts`

```typescript
import { z } from 'zod'

// 콘텐츠 등록
export const createContentSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  publishedAt: z.string().datetime().optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(z.object({
    targetType: z.enum(['first_dealer', 'second_dealer', 'constructor', 'general', 'non_member']),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
  })).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
})

// 콘텐츠 수정
export const updateContentSchema = createContentSchema.partial()

// 목록 조회 쿼리
export const listContentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().refine(v => [20, 50, 100].includes(v), {
    message: 'pageSize must be 20, 50, or 100'
  }).default(20),
  keyword: z.string().optional(),
  categoryIds: z.string().optional(),    // "1,3,7" → split 후 사용
  status: z.enum(['draft', 'published', 'deleted']).default('published'),
  targetType: z.string().optional(),
  department: z.string().optional(),
  internalOnly: z.coerce.boolean().default(false),
  sort: z.enum(['newest', 'oldest', 'views', 'updated']).default('newest'),
})

// 다운로드 기록 조회 쿼리
export const downloadLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().optional(),
})
```

---

## 6. Auth Helper

### 6.1 파일: `src/lib/auth.ts`

```typescript
type UserInfo = {
  source: 'qsp' | 'seko' | 'general'
  id: string
  role: string
  department?: string
}

function getUserFromHeaders(headers: Headers): UserInfo | null
function isInternalUser(role: string): boolean    // super_admin | admin
function isAdmin(role: string): boolean           // super_admin | admin
function canAccessContent(user: UserInfo | null, content: ContentWithTargets): boolean
```

---

## 7. Error Handling

| Code | Error Key | Cause | HTTP |
|------|-----------|-------|------|
| VALIDATION_ERROR | Zod 검증 실패 | 400 |
| UNAUTHORIZED | 인증 헤더 없음 | 401 |
| FORBIDDEN | 권한 없음 | 403 |
| NOT_FOUND | 콘텐츠/파일 미존재 | 404 |
| INTERNAL_ERROR | 서버 에러 | 500 |

---

## 8. Security Considerations

- [x] Zod 입력 검증으로 XSS/Injection 1차 방어
- [x] Prisma 파라미터 바인딩으로 SQL Injection 방지
- [ ] 파일 업로드 MIME 타입 체크 (허용: pdf, image/*, docx, xlsx, pptx)
- [ ] 파일 크기 제한 (단일 파일 50MB)
- [ ] body HTML 살균 (sanitize-html) — v2에서 검토

---

## 9. Implementation Guide

### 9.1 File Structure

```
src/
├── app/api/
│   ├── contents/
│   │   ├── route.ts                          # GET (목록), POST (등록)
│   │   └── [id]/
│   │       ├── route.ts                      # GET (상세), PUT (수정), DELETE (삭제)
│   │       └── files/
│   │           ├── route.ts                  # POST (업로드)
│   │           └── [fileId]/
│   │               └── download/
│   │                   └── route.ts          # GET (다운로드)
│   └── download-logs/
│       └── route.ts                          # GET (다운로드 기록)
├── lib/
│   ├── auth.ts                               # 임시 인증 헬퍼
│   ├── schemas/
│   │   └── content.ts                        # Zod 스키마
│   └── prisma.ts                             # (기존) Prisma 싱글톤
```

### 9.2 Implementation Order

| # | 작업 | 파일 | 선행 조건 |
|---|------|------|----------|
| 1 | Zod 스키마 정의 | `src/lib/schemas/content.ts` | — |
| 2 | 임시 인증 헬퍼 | `src/lib/auth.ts` | — |
| 3 | 콘텐츠 등록 API | `src/app/api/contents/route.ts` (POST) | 1, 2 |
| 4 | 콘텐츠 목록 조회 API | `src/app/api/contents/route.ts` (GET) | 1, 2 |
| 5 | 콘텐츠 상세 조회 API | `src/app/api/contents/[id]/route.ts` (GET) | 1, 2 |
| 6 | 콘텐츠 수정 API | `src/app/api/contents/[id]/route.ts` (PUT) | 1, 2 |
| 7 | 콘텐츠 삭제 API | `src/app/api/contents/[id]/route.ts` (DELETE) | 1, 2 |
| 8 | 첨부파일 업로드 | `src/app/api/contents/[id]/files/route.ts` (POST) | 3 |
| 9 | 첨부파일 다운로드 | `.../files/[fileId]/download/route.ts` (GET) | 8 |
| 10 | 다운로드 기록 조회 | `src/app/api/download-logs/route.ts` (GET) | 9 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
