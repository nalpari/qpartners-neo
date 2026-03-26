# 비밀번호 초기화 API Design Document

> **Summary**: 이메일 기반 비밀번호 재설정 링크 발송 + 토큰 검증 + 비밀번호 변경
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-26
> **Status**: Draft
> **Planning Doc**: [password-reset.plan.md](../../01-plan/features/password-reset.plan.md)
> **화면설계서**: p.11 (초기화 팝업), p.12 (변경 링크 메일), p.13 (회원정보 설정 팝업)

---

## 1. Architecture

```
[Client — 비밀번호 초기화 팝업]
    │  회원유형 + 이메일 입력
    ▼
[POST /api/auth/password-reset/request]
    │  1. Zod 유효성 검증
    │  2. QSP/as-is 이메일 존재 확인 I/F 호출
    │  3. PasswordResetToken 생성 (DB 저장)
    │  4. nodemailer로 변경 링크 메일 발송
    ▼
[사용자 메일함 — 링크 클릭]
    │
    ▼
[POST /api/auth/password-reset/verify]
    │  토큰 유효성 + 만료시간 확인
    ▼
[Client — 회원정보 설정 팝업]
    │  신규 비밀번호 입력
    ▼
[POST /api/auth/password-reset/confirm]
    │  1. 토큰 재검증
    │  2. 비밀번호 정책 검증
    │  3. QSP API로 비밀번호 변경 (확인 필요)
    │  4. 토큰 사용 완료 처리 (used = true)
    │  5. JWT 발행 + 자동 로그인
    ▼
[자동 로그인 완료]
```

---

## 2. API Specification

### `POST /api/auth/password-reset/request` — 초기화 요청

**Request Body:**
```json
{
  "userTp": "DEALER",
  "loginId": "T01",
  "email": "user@example.com"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| userTp | string | Y | enum: ADMIN, DEALER, SEKO, GENERAL |
| loginId | string | 조건부 | 판매점 필수, 일반은 이메일과 동일 |
| email | string | Y | 이메일 형식 |

**회원유형별 입력 항목 (화면설계서 v1.0_260326 p.11):**

| 회원유형 | 입력 항목 | 특정 방식 |
|---------|----------|----------|
| 판매점 (DEALER) | ID + 이메일 | loginId + email로 1건 특정 |
| 시공점 (SEKO) | 이메일 | email만으로 조회 |
| 일반 (GENERAL) | ID(이메일) | loginId = email (동일 값) |

> **미해결**: 시공점은 login_id가 이메일이므로 ID 추가가 무의미.
> as-is DB에서 동일 이메일 + group_kind=30 중복 5건 존재 (다른 사람).
> 현업 확인 필요 — 시공점 중복 이메일 처리 방안.

**서버 처리 흐름:**
1. Zod 유효성 검증
2. 이메일 존재 확인 I/F 호출 (`email` + `userTp` 조합으로 1건 특정)
   - QSP: 판매점(DEALER) / 일반(GENERAL)
   - as-is: 시공점(SEKO) — `login_id` + `group_kind`로 조회
3. 불일치 시 404 반환

> **as-is 중복 데이터 대응**: 동일 `login_id`(이메일)로 `group_kind` 다른 복수 건 존재 (101건).
> `userTp` → `group_kind` 매핑으로 1건 특정:
>
> | QPartners userTp | as-is group_kind | 설명 |
> |-----------------|-----------------|------|
> | DEALER (storeLvl=1) | 10 (A) | 1차 판매점 |
> | DEALER (storeLvl=2) | 20 (B) | 2차 판매점 |
> | SEKO | 30 (C) | 시공점 |
> | GENERAL | — | 일반회원 (QSP에서만 관리) |
4. `PasswordResetToken` 생성 (crypto.randomUUID, 만료: 1시간)
5. nodemailer로 비밀번호 변경 링크 메일 발송
6. 링크 형식: `{SITE_URL}/password-reset?token={token}`

**Response (200 — 성공):**
```json
{
  "data": { "message": "비밀번호 변경 링크가 이메일로 발송되었습니다." }
}
```

**Response (404 — 이메일 불일치):**
```json
{
  "error": "일치하는 회원 정보가 없습니다. 입력하신 정보를 다시 확인해 주세요."
}
```

---

### `POST /api/auth/password-reset/verify` — 토큰 검증

**Request Body:**
```json
{
  "token": "uuid-token-string"
}
```

**서버 처리 흐름:**
1. DB에서 토큰 조회
2. 만료시간 확인 (`expiresAt > now`)
3. 사용 여부 확인 (`used === false`)

**Response (200 — 유효):**
```json
{
  "data": {
    "valid": true,
    "userTp": "GENERAL",
    "userId": "test1"
  }
}
```

**Response (400 — 무효/만료):**
```json
{
  "error": "유효하지 않거나 만료된 링크입니다."
}
```

---

### `POST /api/auth/password-reset/confirm` — 비밀번호 변경

**Request Body:**
```json
{
  "token": "uuid-token-string",
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| token | string | Y | UUID |
| newPassword | string | Y | 비밀번호 정책 (아래 참고) |
| confirmPassword | string | Y | newPassword와 일치 |

**비밀번호 정책:**
- 8자 이상
- 영문대문자 + 영문소문자 + 숫자 조합

**서버 처리 흐름:**
1. 토큰 재검증 (유효 + 미사용 + 미만료)
2. 비밀번호 정책 검증
3. newPassword === confirmPassword 확인
4. QSP 비밀번호 변경 API 호출 (확인 필요)
5. 토큰 `used = true` 업데이트
6. JWT 토큰 발행 + httpOnly 쿠키 설정 (자동 로그인)

**Response (200 — 성공):**
```json
{
  "data": {
    "message": "저장되었습니다.",
    "user": {
      "userId": "test1",
      "userTp": "GENERAL",
      "userNm": "..."
    }
  }
}
```

**Response (400 — 정책 위반):**
```json
{
  "error": "비밀번호는 영문대문자, 영문소문자, 숫자를 조합하여 8자 이상이어야 합니다."
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

**Response (200):**
```json
{
  "data": { "available": true, "message": "사용가능한 이메일입니다." }
}
```

**Response (409):**
```json
{
  "error": "이미 사용중인 이메일입니다."
}
```

---

## 3. Mail Configuration

### SMTP 설정

| 항목 | 값 |
|------|-----|
| SMTP 서버 | smtp.alpha-prm.jp |
| 포트 | 587 |
| 암호화 | 없음 |
| SMTP 인증 | 있음 |
| 사용자명 | q-partners%hqj.co.jp |
| 비밀번호 | (환경변수) |
| 발신자 | Q.PARTNERS事務局 \<q-partners@hqj.co.jp\> |

### 비밀번호 변경 링크 메일 (p.12)

**제목:** [Q.PARTNERS] パスワード再設定のご案内

**본문 (일본어 + 한국어):**
- 비밀번호 재설정 요청 접수 안내
- 변경 링크 포함
- 보안 안내: 일정 시간 후 링크 만료
- Q.PARTNERS 사무국 서명

### nodemailer 유틸리티

파일: `src/lib/mailer.ts`

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

---

## 4. Zod Schemas

파일: `src/lib/schemas/password-reset.ts`

```typescript
export const passwordResetRequestSchema = z.object({
  userTp: z.enum(["ADMIN", "DEALER", "SEKO", "GENERAL"]),
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
});

export const passwordResetVerifySchema = z.object({
  token: z.string().min(1, "토큰은 필수입니다"),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
  confirmPassword: z.string().min(1),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다",
  path: ["confirmPassword"],
});

export const emailCheckSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
});
```

**비밀번호 정책 검증 (커스텀):**
```typescript
// 영문대문자 + 영문소문자 + 숫자 조합
function validatePasswordPolicy(password: string): boolean {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= 8 && hasUpperCase && hasLowerCase && hasNumber;
}
```

---

## 5. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP 서버 호스트 | `smtp.alpha-prm.jp` |
| `SMTP_PORT` | SMTP 포트 | `587` |
| `SMTP_USER` | SMTP 인증 사용자명 | `q-partners%hqj.co.jp` |
| `SMTP_PASS` | SMTP 인증 비밀번호 | (비밀) |
| `SMTP_FROM` | 발신자 이메일 | `q-partners@hqj.co.jp` |
| `SITE_URL` | 사이트 URL (링크 생성용) | `https://dev.q-partners.q-cells.jp` |

---

## 6. File Structure

```
src/app/api/auth/
├── password-reset/
│   ├── request/
│   │   └── route.ts          # POST — 초기화 요청 (메일 발송)
│   ├── verify/
│   │   └── route.ts          # POST — 토큰 검증
│   └── confirm/
│       └── route.ts          # POST — 비밀번호 변경 + 자동 로그인
├── email/
│   └── check/
│       └── route.ts          # POST — 이메일 중복 체크
src/lib/
├── mailer.ts                  # nodemailer 설정 + 메일 발송 유틸
├── schemas/
│   └── password-reset.ts     # Zod 스키마
└── mail-templates/
    └── password-reset.ts     # 비밀번호 변경 메일 템플릿 (HTML)
```

---

## 7. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | nodemailer 설치 + 환경변수 추가 | `package.json`, `.env.*` |
| 2 | 메일 유틸리티 | `src/lib/mailer.ts` |
| 3 | Zod 스키마 | `src/lib/schemas/password-reset.ts` |
| 4 | 메일 템플릿 | `src/lib/mail-templates/password-reset.ts` |
| 5 | 초기화 요청 API | `src/app/api/auth/password-reset/request/route.ts` |
| 6 | 토큰 검증 API | `src/app/api/auth/password-reset/verify/route.ts` |
| 7 | 비밀번호 변경 API | `src/app/api/auth/password-reset/confirm/route.ts` |
| 8 | 이메일 중복 체크 API | `src/app/api/auth/email/check/route.ts` |
| 9 | 미들웨어 공개 경로 추가 | `src/middleware.ts` |

---

## 8. Dependencies / 확인 필요 사항

| 항목 | 상태 | Notes |
|------|------|-------|
| QSP 비밀번호 변경 API | **I/F 요청중** | 비밀번호 변경을 QSP에 반영하는 API (담당자 진행중) |
| QSP 이메일 존재 확인 API | **I/F 요청중** | QSP(판매점/일반) 이메일 존재 유무 확인 |
| as-is 이메일 존재 확인 API | **I/F 요청중** | as-is(시공점) 이메일 존재 유무 확인 |
| nodemailer | 설치 필요 | `pnpm add nodemailer @types/nodemailer` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-26 | Initial draft | CK |
