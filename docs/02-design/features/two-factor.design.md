# 로그인 2차 인증 API Design Document

> **Summary**: 로그인 성공 후 이메일 기반 6자리 인증번호 2차 인증
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-26
> **Status**: Draft
> **Planning Doc**: [password-reset.plan.md](../../01-plan/features/password-reset.plan.md)
> **화면설계서**: p.14 (2차 인증 팝업), p.15 (2차 인증 메일)

---

## 1. Architecture

```
[로그인 성공]
    │
    ▼
[2차 인증 필요 여부 판단]
    │  조건: secAuthYn === "Y" && 비밀번호 초기화 후 로그인이 아닌 경우
    │
    ├── 불필요 → 홈화면 (정상 이용)
    │
    └── 필요 → [POST /api/auth/two-factor/send]
                  │  6자리 인증번호 생성 + DB 저장 + 메일 발송
                  ▼
              [Client — 2차 인증 팝업]
                  │  인증번호 입력 (10분 제한)
                  ▼
              [POST /api/auth/two-factor/verify]
                  ├── 성공 → 홈화면 블러 해제 (성공 메시지 없음)
                  └── 실패 → 오류 메시지
                              │
                              ▼ (재전송 요청 시)
                          [POST /api/auth/two-factor/resend]
```

---

## 2. 2차 인증 대상 판별

QSP 로그인 응답의 `secAuthYn` 필드로 판단:

| 조건 | 2차 인증 |
|------|---------|
| `secAuthYn === "Y"` + 일반 로그인 | 필요 |
| `secAuthYn === "Y"` + 비밀번호 초기화 후 로그인 | **불필요** (p.14 스펙) |
| `secAuthYn !== "Y"` (2단계 인증 해제 회원) | 불필요 |

**구현 방식:**
- 로그인 API 응답에 `requireTwoFactor: boolean` 필드 추가
- 비밀번호 초기화 후 로그인 시 JWT에 `pwdReset: true` 클레임 포함 → 2차 인증 Skip
- 2차 인증 미완료 상태에서는 JWT에 `twoFactorVerified: false` → 미들웨어에서 제한된 접근만 허용

---

## 3. API Specification

### `POST /api/auth/two-factor/send` — 인증번호 발송

**Request Body:**
```json
{
  "userTp": "GENERAL",
  "userId": "test1"
}
```

**서버 처리 흐름:**
1. 기존 미사용 코드 무효화 (같은 userId의 미검증 코드)
2. 6자리 난수 생성 (숫자만)
3. `TwoFactorCode` DB 저장 (만료: 10분)
4. nodemailer로 인증번호 메일 발송

**Response (200):**
```json
{
  "data": {
    "message": "인증번호가 발송되었습니다.",
    "expiresIn": 600
  }
}
```

---

### `POST /api/auth/two-factor/verify` — 인증번호 검증

**Request Body:**
```json
{
  "userTp": "GENERAL",
  "userId": "test1",
  "code": "123456"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| userTp | string | Y | enum |
| userId | string | Y | min(1) |
| code | string | Y | 6자리 숫자 |

**서버 처리 흐름:**
1. DB에서 해당 사용자의 최신 미검증 코드 조회
2. 만료시간 확인 (`expiresAt > now`)
3. 코드 일치 확인
4. 성공 시 `verified = true` 업데이트
5. JWT 재발행 (`twoFactorVerified: true`) + 쿠키 갱신

**Response (200 — 성공):**
```json
{
  "data": { "verified": true }
}
```

**Response (401 — 실패):**
```json
{
  "error": "인증번호가 일치하지 않습니다."
}
```

**Response (401 — 만료):**
```json
{
  "error": "입력시간이 초과되었습니다. 재전송 후, 다시 입력해주세요."
}
```

---

### `POST /api/auth/two-factor/resend` — 인증번호 재전송

**Request Body:**
```json
{
  "userTp": "GENERAL",
  "userId": "test1"
}
```

**서버 처리 흐름:**
1. 기존 미사용 코드 무효화
2. 새 6자리 코드 생성 + DB 저장 (만료: 10분)
3. 메일 재발송

**Response (200):**
```json
{
  "data": {
    "message": "인증번호가 재전송되었습니다.",
    "expiresIn": 600
  }
}
```

---

## 4. Mail Template

### 2차 인증 메일 (p.15)

**발신자:** Q.PARTNERS事務局 \<q-partners@hqj.co.jp\>
**수신자:** 로그인한 사용자의 이메일 주소
**제목:** [Q.PARTNERS] ログイン2段階認証番号のご案内

**본문 핵심:**
```
인증번호 : [123456]

※ 인증번호는 타인에게 공유하지 마세요.
※ 10분이 지나면 자동으로 만료됩니다.
※ 본인이 요청하지 않은 경우, 즉시 비밀번호를 변경해 주세요.
```

파일: `src/lib/mail-templates/two-factor.ts`

---

## 5. Zod Schemas

파일: `src/lib/schemas/two-factor.ts`

```typescript
export const twoFactorSendSchema = z.object({
  userTp: z.enum(["ADMIN", "DEALER", "SEKO", "GENERAL"]),
  userId: z.string().min(1),
});

export const twoFactorVerifySchema = z.object({
  userTp: z.enum(["ADMIN", "DEALER", "SEKO", "GENERAL"]),
  userId: z.string().min(1),
  code: z.string().length(6, "인증번호는 6자리입니다").regex(/^\d+$/, "숫자만 입력 가능합니다"),
});
```

---

## 6. Login API 수정 사항

기존 `POST /api/auth/login` 응답에 2차 인증 관련 필드 추가:

**수정된 응답 (200):**
```json
{
  "data": {
    "userId": "test1",
    "userNm": "tt123",
    "userTp": "GENERAL",
    "compCd": "5200",
    "compNm": null,
    "email": null,
    "deptNm": null,
    "authCd": "NORMAL",
    "storeLvl": null,
    "statCd": null,
    "requireTwoFactor": true
  }
}
```

- `requireTwoFactor: true` → 프론트에서 2차 인증 팝업 호출
- `requireTwoFactor: false` → 바로 홈화면

**JWT 클레임 변경:**
- 2차 인증 필요한 경우: `twoFactorVerified: false`
- 2차 인증 완료 후: JWT 재발행 `twoFactorVerified: true`
- 미들웨어에서 `twoFactorVerified === false`인 경우 2차 인증 API만 접근 허용

---

## 7. Middleware 수정

2차 인증 미완료 상태에서 접근 가능한 경로 추가:

```typescript
const TWO_FACTOR_PATHS = [
  "/api/auth/two-factor/send",
  "/api/auth/two-factor/verify",
  "/api/auth/two-factor/resend",
  "/api/auth/logout",
];
```

JWT에 `twoFactorVerified === false`인 경우:
- `TWO_FACTOR_PATHS`만 접근 허용
- 그 외 API → `{ error: "2차 인증이 필요합니다" }` (403)

---

## 8. File Structure

```
src/app/api/auth/
├── two-factor/
│   ├── send/
│   │   └── route.ts          # POST — 인증번호 발송
│   ├── verify/
│   │   └── route.ts          # POST — 인증번호 검증
│   └── resend/
│       └── route.ts          # POST — 인증번호 재전송
src/lib/
├── schemas/
│   └── two-factor.ts         # Zod 스키마
└── mail-templates/
    └── two-factor.ts         # 2차 인증 메일 템플릿 (HTML)
```

---

## 9. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/two-factor.ts` |
| 2 | 메일 템플릿 | `src/lib/mail-templates/two-factor.ts` |
| 3 | 인증번호 발송 API | `src/app/api/auth/two-factor/send/route.ts` |
| 4 | 인증번호 검증 API | `src/app/api/auth/two-factor/verify/route.ts` |
| 5 | 인증번호 재전송 API | `src/app/api/auth/two-factor/resend/route.ts` |
| 6 | 로그인 API 수정 | `src/app/api/auth/login/route.ts` (requireTwoFactor 추가) |
| 7 | JWT 클레임 수정 | `src/lib/jwt.ts` (twoFactorVerified 추가) |
| 8 | 미들웨어 수정 | `src/middleware.ts` (2차 인증 경로 + 상태 체크) |

---

## 10. 6자리 인증번호 생성

```typescript
function generateTwoFactorCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
```

- 항상 6자리 숫자 (100000 ~ 999999)
- crypto.randomInt 사용도 가능 (보안 강화)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-26 | Initial draft | CK |
