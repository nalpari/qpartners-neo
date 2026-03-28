# 마이페이지 Design Document

> **Summary**: 내정보/회사정보 조회·수정 + 비밀번호 변경 + 회원탈퇴 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **Planning Doc**: [mypage.plan.md](../../01-plan/features/mypage.plan.md)
> **화면설계서**: p.35-40 (confirmed)

---

## 1. API Specification

### `GET /api/mypage/profile` — 내정보/회사정보 조회

JWT에서 사용자 정보 추출 후 회원유형별로 다른 소스에서 조회.

**회원유형별 조회 소스:**
- 판매점/일반/관리자 → QSP user detail API
- 시공점 → AS-IS Seko User Info API

**Response (200):**
```json
{
  "data": {
    "userType": "GENERAL",
    "sei": "金",
    "mei": "志映",
    "seiKana": "キム",
    "meiKana": "ジヨン",
    "email": "kjy0501@interplug.co.kr",
    "compNm": "INTERPLUG TEST",
    "compNmKana": "インタープラグ テスト",
    "zipcode": "108-0014",
    "address1": "東京都港区芝4-10-1",
    "address2": "ハンファビル9F",
    "telNo": "03-5441-5943",
    "fax": "088-685-3054",
    "department": "Sales Team",
    "jobTitle": "Head Manager",
    "corporateNo": null,
    "newsRcptYn": "Y",
    "newsRcptDate": "2026-03-24",
    "withdrawAvailable": true
  }
}
```

**회원유형별 숨김 필드:**

| 필드 | 일반 | 판매점 | 시공점 | 관리자 |
|------|:----:|:-----:|:-----:|:-----:|
| department | O | O | X | O |
| jobTitle | O | O | X | O |
| corporateNo | X | O | X | O |
| withdrawAvailable | O | X | X | X |

---

### `PUT /api/mypage/profile` — 내정보/회사정보 수정

**Request Body:**
```json
{
  "sei": "金",
  "mei": "志映",
  "seiKana": "キム",
  "meiKana": "ジヨン",
  "compNm": "INTERPLUG TEST",
  "compNmKana": "インタープラグ テスト",
  "zipcode": "108-0014",
  "address1": "東京都港区芝4-10-1",
  "address2": "ハンファビル9F",
  "telNo": "03-5441-5943",
  "fax": "088-685-3054",
  "department": "Sales Team",
  "jobTitle": "Head Manager",
  "newsRcptYn": "N"
}
```

**서버 처리 흐름:**
1. JWT에서 사용자 정보 추출
2. Zod 유효성 검증 (회원유형별 필수 항목 차별화)
3. 회원유형별 외부 API 호출:
   - 판매점/일반 → QSP 수정 API
   - 시공점 → AS-IS Seko User Info Update API
   - 관리자 → Q.ORDER T01 판매점 data 변경 (QSP 업데이트 X)
4. 성공 시 200 반환

**회원유형별 필수/수정 가능 항목:**

| 필드 | 일반 | 판매점 | 시공점 | 관리자 |
|------|:----:|:-----:|:-----:|:-----:|
| sei/mei | 필수 | 필수 | 필수 | 필수 |
| seiKana/meiKana | 필수 | 필수 | 필수 | 필수 |
| compNm | 필수 | 필수 | 필수 | 필수 |
| compNmKana | 수정가능 | 수정가능 | 수정가능 | 수정가능 |
| zipcode/address1 | 필수 | 필수 | 필수 | 필수 |
| address2 | 수정가능 | 수정가능 | 수정가능 | 수정가능 |
| telNo | 필수 | 필수 | 필수 | 필수 |
| fax | 수정가능 | **필수** | 수정가능 | 수정가능 |
| department | 수정가능 | 수정가능 | 숨김 | 숨김 |
| jobTitle | 수정가능 | 수정가능 | 숨김 | 수정가능 |
| corporateNo | 숨김 | 수정가능 | 숨김 | 수정가능 |
| newsRcptYn | 수정가능 | 수정가능 | 수정가능 | 수정가능 |

**Response (200):**
```json
{
  "data": { "message": "저장되었습니다." }
}
```

---

### `POST /api/mypage/change-password` — 비밀번호 변경

**Request Body:**
```json
{
  "currentPwd": "1q2w3e4R!",
  "newPwd": "NewPass1234",
  "confirmPwd": "NewPass1234"
}
```

**서버 처리 흐름:**
1. JWT에서 사용자 정보 추출
2. Zod 유효성 검증 + 비밀번호 정책 (영문대문자+소문자+숫자, 8자 이상)
3. newPwd === confirmPwd 확인
4. 외부 API 호출 (chgType=C):
   - 판매점/일반/관리자 → QSP userPwdChg
   - 시공점 → AS-IS Seko Password Change API
5. 실패 시 에러 메시지 반환

**Response (200):**
```json
{
  "data": { "message": "비밀번호가 변경되었습니다." }
}
```

**Response (400):**
```json
{
  "error": "현재 비밀번호가 일치하지 않습니다."
}
```

---

### `POST /api/mypage/withdraw` — 회원탈퇴

일반회원만 사용 가능.

**Request Body:**
```json
{
  "reason": "탈퇴 사유 텍스트"
}
```

**서버 처리 흐름:**
1. JWT에서 사용자 정보 추출
2. userType === GENERAL 확인 (아니면 403)
3. QSP 탈퇴 API 호출 (또는 상태 변경)
4. qp_info 테이블: withdrawn=true, withdrawn_at=NOW(), withdrawn_reason 저장
5. JWT 쿠키 삭제 (로그아웃)

**Response (200):**
```json
{
  "data": { "message": "회원탈퇴가 완료되었습니다. 이용해주셔서 감사합니다." }
}
```

---

### `GET /api/mypage/seko-info` — 시공점 시공ID 정보 조회

AS-IS Seko User Info API 프록시. 시공점 회원 전용.

**Response (200):**
```json
{
  "data": {
    "sekoId": "SEKO-001",
    "sekoIssueDate": "2025-04-01",
    "sekoLimit": "2027-03-31",
    "supplierKind": 4,
    "supplierKindName": null,
    "documents": [
      { "type": "RECEIPT", "label": "수강료영수증", "available": true },
      { "type": "CERT1", "label": "시공증명서 1", "available": true },
      { "type": "CERT2", "label": "시공증명서 2", "available": false }
    ]
  }
}
```

---

### `GET /api/mypage/seko-file` — 시공점 첨부파일 다운로드

AS-IS Seko File Download API 프록시.

**Query Parameters:** `fileType=RECEIPT|CERT1|CERT2`

---

## 2. File Structure

```
src/app/api/mypage/
├── profile/
│   └── route.ts              # GET (조회), PUT (수정)
├── change-password/
│   └── route.ts              # POST
├── withdraw/
│   └── route.ts              # POST (일반회원만)
├── seko-info/
│   └── route.ts              # GET (시공점 전용)
└── seko-file/
    └── route.ts              # GET (시공점 전용)
```

---

## 3. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | 프로필 조회 API | `profile/route.ts` (GET) |
| 2 | 프로필 수정 API | `profile/route.ts` (PUT) |
| 3 | 비밀번호 변경 API | `change-password/route.ts` |
| 4 | 회원탈퇴 API | `withdraw/route.ts` |
| 5 | 시공점 정보 조회 | `seko-info/route.ts` |
| 6 | 시공점 파일 다운로드 | `seko-file/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
