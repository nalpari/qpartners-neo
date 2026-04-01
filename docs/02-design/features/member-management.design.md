# 회원관리 (관리자) Design Document

> **Summary**: 관리자용 회원 목록/상세 조회·수정 + 비밀번호 초기화 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **Planning Doc**: [member-management.plan.md](../../01-plan/features/member-management.plan.md)
> **화면설계서**: p.46-47 (confirmed)

---

## 1. API Specification

### `GET /api/admin/members` — 회원 목록

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| keyword | string | - | ID/성명/이메일/회사명 Like 검색 |
| userType | string | 전체 | 회원유형 필터 |
| status | string | 전체 | 상태 필터 (active/deleted/withdrawn) |
| page | int | 1 | 페이지 번호 |
| pageSize | int | 20 | 페이지 크기 |

**서버 처리 흐름:**
1. 관리자 권한 확인 (JWT)
2. qp_info 테이블 조회 (user_type != SEKO, 시공점 제외)
3. 검색/필터/페이징 처리

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
        "userId": "kjy0501@interplug.co.kr",
        "userName": "金志映",
        "userNameKana": "きむ じよん",
        "email": "kjy0501@interplug.co.kr",
        "userType": "GENERAL",
        "companyName": "Interplug corp.",
        "status": "active",
        "lastLoginAt": "2026-02-15T16:28:05Z",
        "createdAt": "2026-03-06T00:00:00Z"
      }
    ]
  }
}
```

---

### `GET /api/admin/members/:id` — 회원 상세정보

**Response (200):**
```json
{
  "data": {
    "id": 1,
    "userId": "kjy0501@interplug.co.kr",
    "loginId": "kjy0501@interplug.co.kr",
    "userName": "金志映",
    "userNameKana": "きむ じよん",
    "email": "kjy0501@interplug.co.kr",
    "userType": "GENERAL",
    "userRole": "Cus4",
    "companyName": "Interplug corp.",
    "companyNameKana": "いんたーぷらぐ",
    "zipcode": "105-0001",
    "address": "...",
    "telNo": "0000-000-000",
    "faxNo": "0000-000-000",
    "corporateNo": "0000000",
    "department": "住宅営業課",
    "jobTitle": "",
    "twoFactorEnabled": true,
    "loginNotification": true,
    "attributeChangeNotification": true,
    "status": "active",
    "newsRcptYn": "Y",
    "newsRcptDate": "2026-03-24",
    "lastLoginAt": "2026-03-03T10:10:12Z",
    "withdrawnAt": null,
    "withdrawnReason": null,
    "createdAt": "2022-09-05T00:00:00Z",
    "updatedAt": "2022-09-05T10:20:11Z",
    "updatedBy": "admin"
  }
}
```

---

### `PUT /api/admin/members/:id` — 회원 상세정보 수정

**Request Body:**
```json
{
  "userRole": "Cus1",
  "twoFactorEnabled": true,
  "loginNotification": false,
  "attributeChangeNotification": false,
  "status": "active",
  "newsRcptYn": "Y"
}
```

**수정 가능 항목:**

| 필드 | 조건 |
|------|------|
| userRole | 일반회원만 변경 가능 |
| twoFactorEnabled | 전체 |
| loginNotification | 전체 |
| attributeChangeNotification | 전체 |
| status | active/deleted |
| newsRcptYn | 전체 |

**서버 처리 흐름:**
1. 관리자 권한 확인
2. qp_info 테이블 업데이트
3. userRole 변경 시 일반회원인지 검증

---

### `POST /api/admin/members/:id/reset-password` — 비밀번호 초기화

관리자가 특정 회원의 비밀번호를 초기화. 해당 회원 이메일로 비밀번호 변경 링크 발송.

**서버 처리 흐름:**
1. 관리자 권한 확인
2. 대상 회원 정보 조회 (이메일)
3. PasswordResetToken 생성
4. 비밀번호 변경 링크 메일 발송

**Response (200):**
```json
{
  "data": { "message": "비밀번호 변경 링크가 이메일로 발송되었습니다." }
}
```

---

## 2. File Structure

```
src/app/api/admin/
└── members/
    ├── route.ts                    # GET (목록)
    └── [id]/
        ├── route.ts                # GET (상세), PUT (수정)
        └── reset-password/
            └── route.ts            # POST (비밀번호 초기화)
```

---

## 3. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | 회원 목록 API | `members/route.ts` (GET) |
| 2 | 회원 상세 API | `members/[id]/route.ts` (GET) |
| 3 | 회원 수정 API | `members/[id]/route.ts` (PUT) |
| 4 | 비밀번호 초기화 API | `members/[id]/reset-password/route.ts` (POST) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
