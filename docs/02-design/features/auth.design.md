# 인증(로그인) API Design Document

> **Summary**: QSP 외부 로그인 I/F 프록시 + 세션 관리 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-25
> **Status**: Draft
> **Planning Doc**: [auth.plan.md](../../01-plan/features/auth.plan.md)

---

## 1. Architecture

```
[Client Browser]
    │
    ▼
[Next.js Route Handler: POST /api/auth/login]
    │  1. Zod 유효성 검증
    │  2. QSP API 호출 (server-side)
    │  3. 응답 처리 + 세션 생성
    │
    ▼
[QSP External API]
https://jp-dev.qsalesplatform.com/api/qpartners/user/login
```

- 클라이언트 → Next.js API Route → QSP 외부 API (서버사이드 프록시)
- QSP API URL은 클라이언트에 노출되지 않음 (보안)
- 인증 성공 시 httpOnly 쿠키로 세션 관리

---

## 2. QSP Login API Specification

### Request

```
POST https://jp-dev.qsalesplatform.com/api/qpartners/user/login
Content-Type: application/json
```

```json
{
  "loginId": "test1",
  "pwd": "1234",
  "userTp": "GENERAL",
  "accsSiteCd": "QPARTNERS",
  "actLog": "LOGIN",
  "requestId": "{uuid}"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| loginId | string | Y | 로그인 ID |
| pwd | string | Y | 비밀번호 |
| userTp | string | Y | 사용자 유형 (ADMIN/DEALER/SEKO/GENERAL) |
| accsSiteCd | string | Y | 접근 사이트 코드, "QPARTNERS" 고정 |
| actLog | string | Y | 행동 로그 — `LOGIN` / `AUTO_LOGIN` / `LOGOUT` (login route 는 `LOGIN` 고정) |
| requestId | string | N | 요청 추적 ID |

### Response (2026-03-25 실제 호출 확인 완료)

**성공 응답:**
```json
{
  "code": null,
  "data": {
    "resultCd": "SUCCESS",
    "resultMsg": "ログインしました。",
    "userId": "test1",
    "userNm": "tt123",
    "userNmKana": "test 1234 kana",
    "userTp": "GENERAL",
    "compCd": "5200",
    "compNm": null,
    "compNmKana": null,
    "email": null,
    "deptNm": null,
    "pstnNm": null,
    "authCd": "NORMAL",
    "storeLvl": null,
    "statCd": null,
    "secAuthYn": "Y",
    "loginFailCnt": 0,
    "loginFailMinYn": "N",
    "pwdInitYn": null,
    "pwd": ""
  },
  "data2": null,
  "result": {
    "code": 200,
    "resultCode": "S",
    "message": "success",
    "resultMsg": "ログインしました。"
  }
}
```

**실패 응답 (잘못된 비밀번호):**
```json
{
  "code": null,
  "data": null,
  "data2": null,
  "result": {
    "code": 200,
    "resultCode": "E",
    "message": "success",
    "resultMsg": "存在しないアカウントまたは無効なパスワードです。"
  }
}
```

**성공/실패 판별:** `result.resultCode === "S"`

**data 필드 상세:**

| 필드 | Type | 설명 | 예시 |
|------|------|------|------|
| userId | string | 로그인 ID | "test1", "T01" |
| userNm | string | 사용자명 | "ハンファ太郎" |
| userNmKana | string? | 사용자명 카나 | "ハンファ　太郎" |
| userTp | string | 사용자 유형 | "ADMIN", "DEALER", "GENERAL" |
| compCd | string? | 회사코드 | "5200" |
| compNm | string? | 회사명 | "ハンファジャパン株式会社1" |
| email | string? | 이메일 | "josong@qcells.com" |
| deptNm | string? | 부서명 | "経営企画課" |
| pstnNm | string? | 직위명 | "経営企画課" |
| authCd | string? | 권한코드 | "NORMAL", null |
| storeLvl | string? | 판매점 레벨 | "1"(1차), "2"(2차), null |
| statCd | string? | 상태코드 | "A" (활성) |
| secAuthYn | string | 2차인증 여부 | "Y" |
| loginFailCnt | number | 로그인 실패 횟수 | 0 |
| pwdInitYn | string? | 비밀번호 초기화 여부 | "Y" |

---

## 3. Internal API Specification

### `POST /api/auth/login` — 로그인

**Request Body:**
```json
{
  "loginId": "test1",
  "pwd": "1234",
  "userTp": "GENERAL"
}
```

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| loginId | string | Y | — | min(1) |
| pwd | string | Y | — | min(1) |
| userTp | string | N | "GENERAL" | enum: ADMIN, DEALER, SEKO, GENERAL |

**서버 처리 흐름:**
1. Zod 스키마 유효성 검증
2. accsSiteCd("QPARTNERS"), requestId(uuid) 추가하여 QSP API 호출
3. QSP 응답 확인:
   - 성공 → QSP 응답 데이터를 클라이언트에 전달 (+ 필요시 쿠키 설정)
   - 실패 → 에러 메시지 전달

**Response (200 — 성공):**
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
    "statCd": null
  }
}
```

**Response (401 — 인증 실패):**
```json
{
  "error": "아이디 또는 비밀번호가 올바르지 않습니다"
}
```

**Response (502 — QSP 서버 오류):**
```json
{
  "error": "외부 인증 서버 오류가 발생했습니다"
}
```

### `POST /api/auth/logout` — 로그아웃

**서버 처리 흐름:**
1. JWT 쿠키에서 `loginId`(=userId) / `userTp` 추출 — 없거나 만료면 QSP 호출 스킵 (멱등)
2. QSP `POST /api/user/logout` 호출 (`actLog: "LOGOUT"`) — `fetchWithLog` 로 `qp_interface_log` 자동 기록
3. QSP 응답 성공/실패와 무관하게 인증 쿠키 삭제 (fail-open)
   - QSP 502/timeout 이라도 사용자 입장에서는 로그아웃이 반드시 완료되어야 함
   - QSP 측 로그 누락은 `qp_interface_log` 에러 라인으로 운영자가 별도 추적

**Response (200):**
```json
{
  "data": { "message": "로그아웃 되었습니다" }
}
```

**Response (500):**
```json
{
  "error": "ログアウト処理中にサーバーエラーが発生しました"
}
```

---

## 3-1. QSP Logout API Specification

QSP 인터페이스 사양서 v1.0 — `QSP Logout API` 시트 기준.

### Request

```
POST {QSP_BASE_URL}/api/user/logout
Content-Type: application/json
```

```json
{
  "loginId": "test1",
  "accsSiteCd": "QPARTNERS",
  "actLog": "LOGOUT",
  "requestId": "{uuid}"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| loginId | string(100) | Y | 로그인 ID |
| accsSiteCd | string(10) | Y | "QPARTNERS" 고정 |
| actLog | string(10) | Y | `LOGIN` / `AUTO_LOGIN` / `LOGOUT` (logout route 는 `LOGOUT` 고정) |
| requestId | string(255) | N | 요청 추적 ID — 로그아웃 추적 아이디로 사용 가능 |

> 로그인 API 와 달리 **`pwd` 불요**. JWT 쿠키의 `loginId` 만 있으면 호출 가능.

### Response

```json
{
  "result": {
    "code": 200,
    "message": "success",
    "resultCode": "S",
    "resultMsg": ""
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| result.code | int(3) | 200(성공) / 400(에러) |
| result.message | string(255) | 결과 메시지 |
| result.resultCode | string(1) | `S` (성공) / `E` (에러) |
| result.resultMsg | string(255)? | 결과 메시지 2 |

**성공/실패 판별:** `result.resultCode === "S"`

---

## 4. Zod Schemas

파일: `src/lib/schemas/auth.ts`

```typescript
import { z } from "zod";

const userTpValues = ["ADMIN", "DEALER", "SEKO", "GENERAL"] as const;

export const loginRequestSchema = z.object({
  loginId: z.string().min(1, "로그인 ID는 필수입니다"),
  pwd: z.string().min(1, "비밀번호는 필수입니다"),
  userTp: z.enum(userTpValues).default("GENERAL"),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
```

---

## 5. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `QSP_LOGIN_API_URL` | QSP 로그인 API 엔드포인트 | `https://jp-dev.qsalesplatform.com/api/qpartners/user/login` |

- `.env.development`와 `.env.production`에 각각 설정
- 서버사이드 전용 (NEXT_PUBLIC_ 접두사 없음)

---

## 6. Client State (Zustand)

파일: `src/lib/auth-store.ts`

```typescript
interface AuthState {
  user: LoginUser | null;
  isAuthenticated: boolean;
  setUser: (user: LoginUser | null) => void;
  logout: () => void;
}
```

- 로그인 성공 시 `setUser()`로 사용자 정보 저장
- 로그아웃 시 `logout()`으로 상태 초기화
- `isAuthenticated` 파생 상태로 인증 여부 판단

---

## 7. File Structure

```
src/app/api/auth/
├── login/
│   └── route.ts              # POST — QSP 로그인 프록시 + JWT 쿠키 설정
├── logout/
│   └── route.ts              # POST — QSP /api/user/logout 호출 + JWT 쿠키 삭제
└── me/
    └── route.ts              # GET — 현재 로그인 사용자 정보
src/lib/
├── schemas/
│   └── auth.ts               # 로그인 Zod 스키마 + QSP 응답 스키마
├── jwt.ts                    # JWT 토큰 발행/검증 (jose)
└── auth-store.ts             # 인증 상태 Zustand 스토어
src/
└── middleware.ts              # API 인증 보호 미들웨어
```

---

## 8. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | 환경변수 추가 | `.env.development`, `.env.production` |
| 2 | Zod 스키마 | `src/lib/schemas/auth.ts` |
| 3 | 로그인 API Route | `src/app/api/auth/login/route.ts` |
| 4 | ~~QSP 응답 확인 후 스키마 조정~~ | ✅ 2026-03-25 실제 호출 확인 완료 |
| 5 | 로그아웃 API Route | `src/app/api/auth/logout/route.ts` |
| 6 | Zustand auth store | `src/lib/auth-store.ts` |

---

## 9. Security Considerations

- QSP API URL은 서버사이드에서만 사용 (클라이언트 노출 차단)
- 비밀번호는 서버 메모리에 보관하지 않음 (QSP로 전달만)
- httpOnly 쿠키 기반 JWT 세션 관리 구현 완료 (secure, sameSite=lax, 8시간 만료)
- CORS: Next.js API Route이므로 same-origin, 별도 CORS 설정 불필요

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-25 | Initial draft | CK |
| 0.2 | 2026-03-25 | QSP 실제 응답 구조 반영 (4개 계정 테스트 완료) | CK |
| 0.3 | 2026-03-25 | 구현 완료 반영 — JWT/미들웨어/me 엔드포인트 추가, 파일 구조 업데이트 | CK |
| 0.4 | 2026-05-14 | actLog 값 정정(LOGIN), QSP Logout API 사양 및 `/api/auth/logout` 흐름 갱신 | CK |
