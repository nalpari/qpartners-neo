# 대량메일 발송 Design Document

> **Summary**: 대량메일 목록/등록/상세 + 3분 배치 발송 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **Planning Doc**: [mass-mail.plan.md](../../01-plan/features/mass-mail.plan.md)
> **화면설계서**: p.48-50 (confirmed)

---

## 1. API Specification

### `GET /api/admin/mass-mails` — 목록

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| keyword | string | - | 제목 Like 검색 |
| target | string | 전체 | 발송대상 필터 |
| draftOnly | boolean | false | 임시저장만 보기 |
| page | int | 1 | |
| pageSize | int | 20 | |

**Response (200):**
```json
{
  "data": {
    "totalCount": 1000,
    "page": 1,
    "pageSize": 20,
    "list": [
      {
        "id": 1,
        "status": "sent",
        "targets": "관리자, 1차점, 2차점이하, 시공점, 일반",
        "subject": "【Qセルズ】情報連絡シート掲載のお知らせ",
        "hasAttachment": true,
        "senderName": "金志映",
        "senderId": "1301000",
        "sentAt": "2026-03-03T17:00:00Z"
      }
    ]
  }
}
```

---

### `POST /api/admin/mass-mails` — 등록

**Request Body (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| senderName | string | Y | 보낸사람 표시명 |
| targetSuperAdmin | boolean | N | 발송대상: 슈퍼관리자 |
| targetAdmin | boolean | N | 발송대상: 관리자 |
| targetFirstDealer | boolean | N | 발송대상: 1차점 |
| targetSecondDealer | boolean | N | 발송대상: 2차점이하 |
| targetConstructor | boolean | N | 발송대상: 시공점 |
| targetGeneral | boolean | N | 발송대상: 일반 |
| optOut | boolean | N | 수신거부 회원 포함 발송 (default: false) |
| subject | string | Y | 제목 |
| body | string | Y | 내용 (HTML) |
| status | string | Y | "draft" (임시저장) 또는 "pending" (발송) |
| files | File[] | N | 첨부파일 |

**서버 처리 흐름:**
1. 관리자 권한 확인
2. Zod 유효성 검증
3. qp_mass_mails INSERT (status = draft 또는 pending)
4. 첨부파일 → qp_mass_mail_attachments INSERT
5. status = pending이면 배치에서 발송 처리

**Response (201):**
```json
{
  "data": { "id": 1, "message": "메일이 발송되었습니다." }
}
```

---

### `GET /api/admin/mass-mails/:id` — 상세

**Response (200):**
```json
{
  "data": {
    "id": 1,
    "senderName": "Q.PARTNERS사무국",
    "targets": {
      "superAdmin": false,
      "admin": true,
      "firstDealer": true,
      "secondDealer": true,
      "constructor": true,
      "general": true
    },
    "optOut": false,
    "subject": "제목",
    "body": "내용 HTML",
    "status": "sent",
    "sentAt": "2026-03-03T17:00:00Z",
    "attachments": [
      { "id": 1, "fileName": "파일명.pdf", "fileSize": 102400 }
    ],
    "createdBy": "金志映 (1301000)",
    "createdAt": "2026-03-03T17:00:00Z"
  }
}
```

---

## 2. 3분 배치 처리

```
[3분마다 실행]
    ↓
qp_mass_mails WHERE status = 'pending' 조회
    ↓
발송대상별 이메일 수집:
  - QSP (판매점/일반/관리자) → QSP API
  - 시공점 → AS-IS Seko User List API (email만)
    ↓
optOut 옵션 확인:
  - false → 뉴스레터 수신거부 회원 제외
  - true → 전체 포함
    ↓
개별 발송 (수신자 본인 정보만 표시)
    ↓
status = 'sent', sentAt = NOW() 업데이트
```

**배치 구현 위치:** `src/lib/batch/mass-mail-sender.ts` (cron 또는 API 트리거)

---

## 3. File Structure

```
src/app/api/admin/
└── mass-mails/
    ├── route.ts                    # GET (목록), POST (등록)
    └── [id]/
        └── route.ts                # GET (상세)
src/lib/
├── schemas/
│   └── mass-mail.ts               # Zod 스키마
└── batch/
    └── mass-mail-sender.ts         # 3분 배치 발송 로직
```

---

## 4. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/mass-mail.ts` |
| 2 | 목록 API | `mass-mails/route.ts` (GET) |
| 3 | 등록 API | `mass-mails/route.ts` (POST) |
| 4 | 상세 API | `mass-mails/[id]/route.ts` (GET) |
| 5 | 배치 발송 로직 | `src/lib/batch/mass-mail-sender.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
