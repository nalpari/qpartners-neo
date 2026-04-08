# 첨부파일 API 확장 Planning Document

> **Summary**: 콘텐츠 첨부파일의 전체 ZIP 다운로드 + 삭제/수정(교체) API 추가
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-08
> **Status**: Draft
> **요청 출처**: edit-api.md #2-1, #2-2 (프론트엔드 팀)

---

## 1. Overview

현재 콘텐츠 첨부파일은 **업로드(POST)**와 **개별 다운로드(GET)**만 지원한다. 프론트엔드 팀의 요청에 따라 다음 3개 API를 추가한다.

1. **전체 파일 ZIP 다운로드** — 콘텐츠에 첨부된 모든 파일을 ZIP으로 묶어 다운로드
2. **첨부파일 삭제** — 특정 첨부파일 삭제 (디스크 파일 + DB 레코드)
3. **첨부파일 교체** — 특정 첨부파일을 새 파일로 교체

---

## 2. Scope

### 2.1 In Scope

- [ ] `GET /api/contents/:id/files/download-all` — 전체 파일 ZIP 다운로드
- [ ] `DELETE /api/contents/:id/files/:fileId` — 첨부파일 삭제
- [ ] `PUT /api/contents/:id/files/:fileId` — 첨부파일 교체 (multipart/form-data)
- [ ] 디스크 파일 정리 (삭제/교체 시)
- [ ] 다운로드 로그 기록 (ZIP 다운로드도 개별 파일별로 기록)
- [ ] 권한 검증 (수정은 관리자, 다운로드는 콘텐츠 접근 권한자)

### 2.2 Out of Scope

- 기존 업로드 API (POST) 수정 — 이미 구현되어 있음
- 기존 개별 다운로드 API — 유지
- 첨부파일 순서 변경 (sortOrder 재정렬) — 별도 이슈
- 미리보기/썸네일 — 별도 이슈

---

## 3. Requirements

### 3.1 전체 파일 ZIP 다운로드 (FR-01 ~ FR-05)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | 콘텐츠 ID 기준으로 모든 첨부파일을 ZIP으로 묶어 반환 | High |
| FR-02 | 콘텐츠 접근 권한 검증 (기존 canAccessContent 재사용) | High |
| FR-03 | 첨부파일이 0건이면 404 반환 | Medium |
| FR-04 | ZIP 파일명: `{콘텐츠 제목}_attachments.zip` (안전 파일명 변환) | Medium |
| FR-05 | 개별 파일별로 DownloadLog 기록 | Medium |

### 3.2 첨부파일 삭제 (FR-06 ~ FR-09)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-06 | 관리자만 삭제 가능 (canModifyContent 검증) | High |
| FR-07 | DB 레코드 삭제 + 디스크 파일 삭제 (트랜잭션) | High |
| FR-08 | DownloadLog의 attachmentId FK로 인해 로그 처리 정책 결정 필요 | High |
| FR-09 | 파일이 디스크에 없어도 DB 레코드는 삭제 성공 | Medium |

### 3.3 첨부파일 교체 (FR-10 ~ FR-14)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10 | 관리자만 교체 가능 | High |
| FR-11 | multipart/form-data로 새 파일 1개 수신 | High |
| FR-12 | 기존 파일 검증 규칙 재사용 (MIME, 확장자, 크기 50MB) | High |
| FR-13 | 기존 디스크 파일 삭제 + 새 파일 저장 (실패 시 롤백) | High |
| FR-14 | DB 레코드의 fileName, filePath, fileSize, mimeType 갱신 | High |

---

## 4. API Endpoints

```
GET    /api/contents/:id/files/download-all       → ZIP 다운로드
DELETE /api/contents/:id/files/:fileId            → 첨부파일 삭제
PUT    /api/contents/:id/files/:fileId            → 첨부파일 교체 (multipart/form-data)
```

---

## 5. 기술 검토 사항

### 5.1 ZIP 라이브러리 선택

| 후보 | 장점 | 단점 |
|------|------|------|
| `archiver` | Node.js 표준, 스트리밍 지원 | CommonJS |
| `jszip` | 간단, Promise 기반 | 메모리 사용량 ↑ |
| `adm-zip` | 동기 API | 메모리 사용량 ↑ |

**선택**: `archiver` — 스트리밍으로 메모리 효율적, Next.js Response와 호환

### 5.2 DownloadLog FK 제약 (FR-08)

현재 스키마:
```prisma
model DownloadLog {
  attachmentId Int
  attachment   ContentAttachment @relation(fields: [attachmentId], references: [id])
}
```

첨부파일 삭제 시 FK 제약으로 인해 문제 발생 가능. 3가지 옵션:
1. **Cascade 삭제** — DownloadLog도 함께 삭제 (이력 손실)
2. **onDelete: SetNull** — attachmentId를 nullable로 변경 + SetNull (스키마 변경 필요)
3. **FK 제거** — 로그 유지, 고아 레코드 허용 (FK만 제거)

**권장**: 옵션 2 (onDelete: SetNull) — 이력 보존 + 안전성

### 5.3 파일 트랜잭션 패턴

삭제/교체 시 디스크 작업과 DB 작업의 원자성 보장:
- **삭제**: DB 먼저 → 디스크 삭제 (DB 실패 시 디스크 보존, 디스크 실패 시 경고 로그만)
- **교체**: 새 파일 쓰기 → DB 업데이트 → 기존 파일 삭제 (실패 시 새 파일 정리)

기존 업로드 route와 동일 패턴.

---

## 6. 위험 요소 및 대응

| # | 위험 | 대응 |
|---|------|------|
| R1 | 대용량 ZIP 생성 시 메모리 부족 | archiver 스트리밍 사용 |
| R2 | DownloadLog FK로 인한 삭제 실패 | Prisma 마이그레이션으로 SetNull 적용 |
| R3 | 파일 경합 (동시 삭제/교체) | 트랜잭션 + Optimistic Lock 고려 |
| R4 | 디스크 정리 실패로 고아 파일 | 경고 로그 + 추후 정리 배치 검토 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-08 | Initial draft | CK |
