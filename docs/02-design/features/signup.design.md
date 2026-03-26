# 일반 회원가입 API Design Document

> **Summary**: QSP `newUserReq` I/F 프록시 + 이메일 중복체크 + 승인완료 메일 발송 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-26
> **Status**: Draft
> **Planning Doc**: [signup.plan.md](../../01-plan/features/signup.plan.md)
> **화면설계서**: p.16 (회원가입), p.17 (우편번호검색), p.18 (가입완료 팝업), p.19 (승인완료 메일)

---

## 1. Architecture

```
[Client — 회원가입 화면]
    │
    ▼
[POST /api/auth/signup]
    │  1. Zod 유효성 검증
    │  2. 비밀번호 정책 검증 (영문대문자 + 영문소문자 + 숫자 조합, 8자 이상)
    │  3. QSP newUserReq I/F 호출 (server-side)
    │  4. 성공 시 승인완료 메일 발송 (nodemailer)
    ▼
[QSP External API]
POST /api/qpartners/user/newUserReq
```

- 클라이언트 → Next.js API Route → QSP 외부 API (서버사이드 프록시)
- QSP API URL은 클라이언트에 노출되지 않음 (보안)
- 이메일 중복체크는 별도 엔드포인트 (`POST /api/auth/email/check`)

---

## 2. QSP newUserReq API Specification

### Request

```
POST {QSP_BASE_URL}/api/qpartners/user/newUserReq
Content-Type: application/json
```

| Field | Type | Length | Required | Description |
|-------|------|--------|----------|-------------|
| userTp | string | 10 | Y | `"GENERAL"` 고정 |
| userId | string | 100 | Y | 이메일 = userId |
| pwd | string | 100 | Y | 비밀번호 |
| user1stNm | string | 50 | Y | 이름 (名) |
| user2ndNm | string | 50 | Y | 성 (姓) |
| user1stNmKana | string | 50 | Y | 이름 카나 |
| user2ndNmKana | string | 50 | Y | 성 카나 |
| email | string | 100 | Y | 이메일 (userId와 동일) |
| deptNm | string | 50 | N | 부서명 |
| pstnNm | string | 50 | N | 직책/직위명 |
| compNm | string | 100 | Y | 회사명 |
| compNmKana | string | 100 | Y | 회사명 카나 |
| compPostCd | string | 10 | Y | 회사 우편번호 |
| compAddr | string | 255 | Y | 회사 주소 1 |
| compAddr2 | string | 255 | Y | 회사 주소 2 |
| compTelNo | string | 100 | Y | 회사 전화번호 |
| compFaxNo | string | 100 | N | 회사 Fax번호 |
| newsRcptYn | string | 1 | Y | 뉴스레터 수신 여부 (`"Y"` / `"N"`) |
| authCd | string | 10 | Y | `"NORMAL"` 고정 (일반회원 권한) |

> **Note**: `joinSourceCd` 필드는 삭제 예정 (2026-03-26 확인). 전송하지 않음.

### Response

```json
{
  "data": null,
  "result": {
    "code": 200,
    "message": "success",
    "resultCode": "S",
    "resultMsg": ""
  }
}
```

**성공/실패 판별:** `result.resultCode === "S"`

---

## 3. Internal API Specification

### `POST /api/auth/signup` — 일반 회원가입

**Request Body:**
```json
{
  "email": "user@example.com",
  "pwd": "Password123!",
  "confirmPwd": "Password123!",
  "user1stNm": "太郎",
  "user2ndNm": "山田",
  "user1stNmKana": "タロウ",
  "user2ndNmKana": "ヤマダ",
  "compNm": "株式会社テスト",
  "compNmKana": "カブシキガイシャテスト",
  "compPostCd": "1600022",
  "compAddr": "東京都新宿区新宿",
  "compAddr2": "1-1-1",
  "compTelNo": "03-1234-5678",
  "compFaxNo": "03-1234-5679",
  "deptNm": "営業部",
  "pstnNm": "課長",
  "newsRcptYn": "Y"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | Y | 이메일 형식, max 100 |
| pwd | string | Y | 비밀번호 정책 (영문대문자 + 영문소문자 + 숫자 조합, 8자 이상) |
| confirmPwd | string | Y | pwd와 일치 |
| user1stNm | string | Y | min 1, max 50 |
| user2ndNm | string | Y | min 1, max 50 |
| user1stNmKana | string | Y | min 1, max 50 |
| user2ndNmKana | string | Y | min 1, max 50 |
| compNm | string | Y | min 1, max 100 |
| compNmKana | string | Y | min 1, max 100 |
| compPostCd | string | Y | min 1, max 10 |
| compAddr | string | Y | min 1, max 255 |
| compAddr2 | string | Y | min 1, max 255 |
| compTelNo | string | Y | min 1, max 100 |
| compFaxNo | string | N | max 100 |
| deptNm | string | N | max 50 |
| pstnNm | string | N | max 50 |
| newsRcptYn | string | Y | `"Y"` 또는 `"N"` |

**서버 처리 흐름:**
1. Zod 스키마 유효성 검증
2. 비밀번호 정책 검증 (영문대문자 + 영문소문자 + 숫자 조합, 8자 이상)
3. pwd === confirmPwd 확인
4. QSP `newUserReq` I/F 호출:
   - `userTp`: `"GENERAL"` 고정
   - `userId`: email
   - `authCd`: `"NORMAL"` 고정
   - 나머지 필드 그대로 전달
5. QSP 성공 시 승인완료 메일 발송 (nodemailer, 비동기 — 메일 실패해도 가입 성공 응답)
6. 클라이언트에 성공 응답

**Response (200 — 성공):**
```json
{
  "data": {
    "userName": "山田太郎",
    "email": "user@example.com"
  }
}
```

**Response (400 — 검증 실패):**
```json
{
  "error": "Validation failed",
  "fields": [{ "field": "pwd", "message": "비밀번호는 영문대문자, 영문소문자, 숫자를 조합하여 8자 이상이어야 합니다" }]
}
```

**Response (409 — 이미 등록된 이메일):**
```json
{
  "error": "이미 등록된 이메일입니다"
}
```

**Response (502 — QSP 서버 오류):**
```json
{
  "error": "외부 서버 오류가 발생했습니다"
}
```

---

### `POST /api/auth/email/check` — 이메일 중복 체크

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 — 사용 가능):**
```json
{
  "data": { "available": true, "message": "사용 가능한 이메일입니다" }
}
```

**Response (409 — 이미 사용 중):**
```json
{
  "error": "이미 사용중인 이메일입니다"
}
```

> **Note**: QSP 이메일 중복체크 전용 I/F가 없으므로, 현재는 QSP 유저정보 조회 API를 활용하여 존재 여부를 판단.
> I/F 요청 진행 중이며, 전용 API가 나오면 교체 예정.

---

## 4. Zod Schemas

파일: `src/lib/schemas/signup.ts`

```typescript
import { z } from "zod";

/** 비밀번호 정책: 영문대문자 + 영문소문자 + 숫자 조합, 8자 이상 */
export function validatePasswordPolicy(password: string): boolean {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= 8 && hasUpperCase && hasLowerCase && hasNumber;
}

export const signupRequestSchema = z
  .object({
    email: z.string().email("유효한 이메일 주소를 입력해주세요").max(100),
    pwd: z.string().min(8, "비밀번호는 8자 이상이어야 합니다").max(100),
    confirmPwd: z.string().min(1, "비밀번호 확인은 필수입니다"),
    user1stNm: z.string().min(1, "이름은 필수입니다").max(50),
    user2ndNm: z.string().min(1, "성은 필수입니다").max(50),
    user1stNmKana: z.string().min(1, "이름(카나)은 필수입니다").max(50),
    user2ndNmKana: z.string().min(1, "성(카나)은 필수입니다").max(50),
    compNm: z.string().min(1, "회사명은 필수입니다").max(100),
    compNmKana: z.string().min(1, "회사명(카나)은 필수입니다").max(100),
    compPostCd: z.string().min(1, "우편번호는 필수입니다").max(10),
    compAddr: z.string().min(1, "주소는 필수입니다").max(255),
    compAddr2: z.string().min(1, "주소2는 필수입니다").max(255),
    compTelNo: z.string().min(1, "전화번호는 필수입니다").max(100),
    compFaxNo: z.string().max(100).optional().default(""),
    deptNm: z.string().max(50).optional().default(""),
    pstnNm: z.string().max(50).optional().default(""),
    newsRcptYn: z.enum(["Y", "N"], { message: "뉴스레터 수신 여부는 Y 또는 N입니다" }),
  })
  .refine((data) => data.pwd === data.confirmPwd, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPwd"],
  })
  .refine((data) => validatePasswordPolicy(data.pwd), {
    message: "비밀번호는 영문대문자, 영문소문자, 숫자를 조합하여 8자 이상이어야 합니다",
    path: ["pwd"],
  });

export type SignupRequestInput = z.infer<typeof signupRequestSchema>;

export const emailCheckSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
});

export type EmailCheckInput = z.infer<typeof emailCheckSchema>;

/** QSP newUserReq 응답 스키마 */
export const qspSignupResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: z.object({
    code: z.number(),
    message: z.string(),
    resultCode: z.string(),
    resultMsg: z.string(),
  }),
});

export type QspSignupResponse = z.infer<typeof qspSignupResponseSchema>;
```

---

## 5. Mail Configuration

### 승인완료 메일 (화면설계서 p.19)

| 항목 | 값 |
|------|-----|
| SMTP 서버 | smtp.alpha-prm.jp |
| 포트 | 587 |
| 발신자 | Q.PARTNERS事務局 \<q-partners@hqj.co.jp\> |
| 제목 | [Q.PARTNERS] 会員登録完了のお知らせ |

**본문 내용 (일본어 + 한국어):**
- 회원가입 완료 안내
- 성+이름 표시
- 로그인 URL: `{SITE_URL}/login`
- 마이페이지 URL: `{SITE_URL}/mypage`
- Q.PARTNERS 사무국 서명

### nodemailer 유틸리티

파일: `src/lib/mailer.ts` — password-reset과 공용

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
```

### 메일 템플릿

파일: `src/lib/mail-templates/signup-complete.ts`

---

## 6. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `QSP_SIGNUP_API_URL` | QSP 회원가입 API 엔드포인트 | `https://jp-dev.qsalesplatform.com/api/qpartners/user/newUserReq` |
| `SMTP_HOST` | SMTP 서버 호스트 | `smtp.alpha-prm.jp` |
| `SMTP_PORT` | SMTP 포트 | `587` |
| `SMTP_USER` | SMTP 인증 사용자명 | `q-partners%hqj.co.jp` |
| `SMTP_PASS` | SMTP 인증 비밀번호 | (비밀) |
| `SMTP_FROM` | 발신자 이메일 | `q-partners@hqj.co.jp` |
| `SITE_URL` | 사이트 URL (메일 내 링크용) | `https://dev.q-partners.q-cells.jp` |

---

## 7. File Structure

```
src/app/api/auth/
├── signup/
│   └── route.ts              # POST — 일반 회원가입 (QSP newUserReq 프록시 + 메일)
├── email/
│   └── check/
│       └── route.ts          # POST — 이메일 중복 체크
src/lib/
├── mailer.ts                  # nodemailer 설정 + 메일 발송 유틸 (공용)
├── schemas/
│   └── signup.ts             # 회원가입 Zod 스키마 + 비밀번호 정책
└── mail-templates/
    └── signup-complete.ts    # 승인완료 메일 HTML 템플릿
```

---

## 8. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | 환경변수 추가 | `.env.development` |
| 2 | nodemailer 설치 | `package.json` |
| 3 | Zod 스키마 | `src/lib/schemas/signup.ts` |
| 4 | 메일러 유틸리티 | `src/lib/mailer.ts` |
| 5 | 승인완료 메일 템플릿 | `src/lib/mail-templates/signup-complete.ts` |
| 6 | 회원가입 API Route | `src/app/api/auth/signup/route.ts` |
| 7 | 이메일 중복체크 API Route | `src/app/api/auth/email/check/route.ts` |
| 8 | 미들웨어 공개 경로 추가 | `src/middleware.ts` |

---

## 9. Security Considerations

- QSP API URL은 서버사이드에서만 사용 (클라이언트 노출 차단)
- 비밀번호는 서버 메모리에 보관하지 않음 (QSP로 전달만)
- 비밀번호 정책: 영문대문자 + 영문소문자 + 숫자 조합, 8자 이상
- 이메일 중복체크 응답에서 기존 회원 상세 정보 노출 차단 (available/unavailable만)
- 메일 발송 실패 시에도 가입은 성공 처리 (메일은 보조 기능)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-26 | Initial draft (QSP I/F v0.8 확인 반영, joinSourceCd 삭제 예정) | CK |
