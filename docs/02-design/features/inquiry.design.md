# 문의 등록 Design Document

> **Summary**: 문의 등록 + 문의유형별 수신 담당자 메일 발송 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **Planning Doc**: [inquiry.plan.md](../../01-plan/features/inquiry.plan.md)
> **화면설계서**: p.42-43 (confirmed)

---

## 1. API Specification

### `POST /api/inquiries` — 문의 등록

**Request Body:**
```json
{
  "companyName": "INTERPLUG TEST",
  "userName": "金志映",
  "tel": "03-5441-5943",
  "email": "kjy0501@interplug.co.kr",
  "inquiryType": "01",
  "title": "문의 제목",
  "content": "문의 내용"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| companyName | string | Y | |
| userName | string | Y | |
| tel | string | N | |
| email | string | Y | 이메일 형식 |
| inquiryType | string | Y | 01~08 |
| title | string | Y | |
| content | string | Y | |

**서버 처리 흐름:**
1. Zod 유효성 검증
2. 로그인 상태면 JWT에서 userType, userId 추출
3. `qp_inquiries` 테이블에 저장
4. 공통코드에서 `inquiryType`에 해당하는 수신 담당자 이메일 조회 (relCode1~3)
5. 수신 담당자에게 문의 내용 메일 발송 (nodemailer)
6. 작성자에게 접수 확인 메일 발송 (비동기)

**Response (200):**
```json
{
  "data": { "message": "문의가 접수되었습니다. 내용 확인 후 담당자가 회신 드리겠습니다." }
}
```

---

## 2. 메일 발송

### 수신 담당자 메일
- **수신**: 공통코드 relCode1~3에 설정된 이메일 (최대 3명)
- **발신**: Q.PARTNERS事務局 <q-partners@hqj.co.jp>
- **내용**: 문의유형, 회사명, 성명, 이메일, 전화번호, 제목, 내용

### 접수 확인 메일
- **수신**: 작성자 이메일
- **발신**: Q.PARTNERS事務局 <q-partners@hqj.co.jp>
- **내용**: 문의 접수 확인 안내

---

## 3. 미들웨어

`POST /api/inquiries`는 **로그인 전에도 접근 가능**해야 하므로 미들웨어 PUBLIC_PATHS에 추가 필요.

---

## 4. File Structure

```
src/app/api/inquiries/
└── route.ts                   # POST
src/lib/
├── schemas/
│   └── inquiry.ts             # Zod 스키마
└── mail-templates/
    └── inquiry.ts             # 문의 메일 템플릿
```

---

## 5. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/inquiry.ts` |
| 2 | 메일 템플릿 | `src/lib/mail-templates/inquiry.ts` |
| 3 | 문의 등록 API | `src/app/api/inquiries/route.ts` |
| 4 | 미들웨어 공개 경로 추가 | `src/middleware.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
