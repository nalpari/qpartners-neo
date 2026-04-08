# 첨부파일 API 확장 Design Document

> **Summary**: 전체 ZIP 다운로드 + 삭제/교체 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-08
> **Status**: Draft
> **Planning Doc**: [attachment-api.plan.md](../../01-plan/features/attachment-api.plan.md)

---

## 1. API Specification

### `GET /api/contents/:id/files/download-all` — 전체 파일 ZIP 다운로드

**Path Parameters:**
- `id` (integer, required): 콘텐츠 ID

**Auth:** 콘텐츠 접근 권한 (비로그인도 published + targets 조건 충족 시 가능)

**서버 처리 흐름:**
1. 콘텐츠 ID 검증
2. 콘텐츠 조회 + 접근권한 검증 (`canAccessContent`)
3. 첨부파일 목록 조회 (sortOrder 순)
4. 첨부파일 0건이면 404 반환
5. archiver로 ZIP 스트림 생성
6. 각 파일을 디스크에서 읽어 ZIP에 추가
7. 개별 DownloadLog 기록 (사용자 식별되는 경우만)
8. ZIP 스트림을 Response로 반환

**Response (200):**
```
Content-Type: application/zip
Content-Disposition: attachment; filename="download.zip"; filename*=UTF-8''{제목}_attachments.zip
Body: (ZIP binary stream)
```

**Response (404):**
```json
{ "error": "첨부파일이 없습니다" }
```

**Response (403):**
```json
{ "error": "접근 권한이 없습니다" }
```

**ZIP 내부 구조:**
```
{제목}_attachments.zip
├── 파일1.pdf
├── 파일2.xlsx
└── 파일3.png
```

- 내부 파일명은 원본 `fileName` 사용 (UUID 저장명이 아님)
- 중복 파일명 처리: `파일1 (1).pdf`, `파일1 (2).pdf` 형태로 자동 번호 부여

---

### `DELETE /api/contents/:id/files/:fileId` — 첨부파일 삭제

**Path Parameters:**
- `id` (integer, required): 콘텐츠 ID
- `fileId` (integer, required): 첨부파일 ID

**Auth:** 관리자(`requireAdmin`) + 콘텐츠 수정 권한(`canModifyContent`)

**서버 처리 흐름:**
1. 관리자 권한 확인
2. ID 파라미터 검증
3. 콘텐츠 + 첨부파일 존재 확인 (404 처리)
4. `canModifyContent`로 수정 권한 검증
5. Prisma 트랜잭션:
   - `contentAttachment.delete()` — FK SetNull로 DownloadLog.attachmentId는 null로 변경
6. 디스크 파일 삭제 (`unlink`, 실패해도 경고 로그만)
7. 200 응답

**Response (200):**
```json
{ "data": { "message": "첨부파일을 삭제했습니다" } }
```

**Response (404):**
```json
{ "error": "첨부파일을 찾을 수 없습니다" }
```

**Response (403):**
```json
{ "error": "삭제 권한이 없습니다" }
```

---

### `PUT /api/contents/:id/files/:fileId` — 첨부파일 교체

**Path Parameters:**
- `id` (integer, required): 콘텐츠 ID
- `fileId` (integer, required): 첨부파일 ID

**Request Body (multipart/form-data):**
- `file` (File, required): 새 파일 1개

**Auth:** 관리자(`requireAdmin`) + 콘텐츠 수정 권한(`canModifyContent`)

**서버 처리 흐름:**
1. 관리자 권한 확인
2. ID 파라미터 검증
3. 콘텐츠 + 기존 첨부파일 조회 (404 처리)
4. `canModifyContent`로 수정 권한 검증
5. FormData에서 새 파일 추출
6. 파일 검증 (MAX_FILE_SIZE, ALLOWED_EXTENSIONS, ALLOWED_MIMES) — 기존 업로드 route 규칙 재사용
7. 새 파일을 디스크에 저장 (safeFileName = randomUUID + ext)
8. DB 레코드 업데이트 (fileName, filePath, fileSize, mimeType, updatedBy, updatedAt)
9. 기존 디스크 파일 삭제 (실패해도 경고 로그만)
10. 201 응답 with 업데이트된 attachment 정보

**Response (201):**
```json
{
  "data": {
    "id": 42,
    "fileName": "새파일.pdf",
    "fileSize": 102400,
    "mimeType": "application/pdf"
  }
}
```

**Response (400):**
```json
{ "error": "파일 크기가 50MB를 초과합니다: xxx.pdf" }
```

**Response (403):**
```json
{ "error": "수정 권한이 없습니다" }
```

**Response (404):**
```json
{ "error": "첨부파일을 찾을 수 없습니다" }
```

---

## 2. File Structure

```
src/app/api/contents/[id]/files/
├── route.ts                       # 기존 — POST (업로드)
├── download-all/
│   └── route.ts                   # 신규 — GET (ZIP 다운로드)
└── [fileId]/
    ├── route.ts                   # 신규 — DELETE (삭제), PUT (교체)
    └── download/
        └── route.ts               # 기존 — GET (개별 다운로드)
```

**추가 파일:**
- `src/lib/zip-utils.ts` (선택) — ZIP 생성 공통 유틸 (archiver 래퍼)

---

## 3. Prisma Schema 변경

### DownloadLog.attachmentId를 nullable + SetNull로 변경

**변경 전:**
```prisma
model DownloadLog {
  attachmentId Int
  attachment   ContentAttachment @relation(fields: [attachmentId], references: [id])
}
```

**변경 후:**
```prisma
model DownloadLog {
  attachmentId Int?
  attachment   ContentAttachment? @relation(fields: [attachmentId], references: [id], onDelete: SetNull)
}
```

**마이그레이션:**
```bash
pnpm prisma migrate dev --name attachment_setnull
```

**주의:** 기존 DownloadLog 데이터의 attachmentId는 유지되며, 이후 삭제 시에만 null로 변환됨.

---

## 4. 의존성 추가

```json
{
  "dependencies": {
    "archiver": "^7.0.1"
  },
  "devDependencies": {
    "@types/archiver": "^6.0.2"
  }
}
```

---

## 5. 공통 검증 상수 (기존 업로드 route와 공유)

현재 `src/app/api/contents/[id]/files/route.ts`에 정의된 상수를 `src/lib/file-validation.ts`로 추출하여 공유:

```typescript
// src/lib/file-validation.ts
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "xlsx", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
]);

export const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export function validateFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `파일 크기가 50MB를 초과합니다: ${file.name}` };
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `허용되지 않는 파일 확장자입니다: ${file.name}` };
  }
  const mime = file.type || "";
  if (!ALLOWED_MIMES.includes(mime) && !mime.startsWith("image/")) {
    return { ok: false, error: `허용되지 않는 파일 형식입니다: ${file.name}` };
  }
  return { ok: true };
}
```

기존 업로드 route도 이 공통 유틸을 사용하도록 리팩토링.

---

## 6. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | archiver 의존성 추가 | `package.json` |
| 2 | 파일 검증 공통 유틸 추출 | `src/lib/file-validation.ts` |
| 3 | 기존 업로드 route 리팩토링 | `src/app/api/contents/[id]/files/route.ts` |
| 4 | Prisma 스키마 수정 + 마이그레이션 | `prisma/schema.prisma` |
| 5 | 삭제 API 구현 | `src/app/api/contents/[id]/files/[fileId]/route.ts` (DELETE) |
| 6 | 교체 API 구현 | `src/app/api/contents/[id]/files/[fileId]/route.ts` (PUT) |
| 7 | ZIP 다운로드 API 구현 | `src/app/api/contents/[id]/files/download-all/route.ts` |
| 8 | OpenAPI 스펙 업데이트 | `src/lib/openapi.ts` |
| 9 | 빌드 검증 + 테스트 | - |

---

## 7. 테스트 시나리오

### 7.1 ZIP 다운로드
- [ ] 첨부파일 여러 개 있는 콘텐츠 ZIP 다운로드 성공
- [ ] 첨부파일 없는 콘텐츠 404
- [ ] 비로그인 + 접근 권한 없는 콘텐츠 403
- [ ] 삭제된 콘텐츠 404
- [ ] 중복 파일명 처리 확인 (`파일.pdf`, `파일 (1).pdf`)

### 7.2 삭제
- [ ] 관리자 + 본인 콘텐츠 첨부파일 삭제 성공
- [ ] 관리자 + 타인 콘텐츠 첨부파일 403
- [ ] 비관리자 403
- [ ] 존재하지 않는 첨부파일 404
- [ ] DownloadLog의 attachmentId가 null로 변경됨 확인
- [ ] 디스크 파일 삭제 확인

### 7.3 교체
- [ ] 관리자 + 본인 콘텐츠 첨부파일 교체 성공
- [ ] 파일 크기 초과 시 400
- [ ] 허용되지 않은 확장자 400
- [ ] 파일 없이 요청 시 400
- [ ] 기존 디스크 파일이 삭제되는지 확인
- [ ] DB 레코드의 fileName, filePath, fileSize 변경 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-08 | Initial draft | CK |
