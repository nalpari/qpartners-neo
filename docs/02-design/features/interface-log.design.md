# 인터페이스 로그 Design Document

> **Summary**: QSP/시공점 등 외부 시스템 API 호출 이력 자동 기록 + 관리자 조회 API
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-13
> **Status**: Draft
> **Planning Doc**: [interface-log.plan.md](../../01-plan/features/interface-log.plan.md)

---

## 1. Data Model (Prisma)

```
QpInterfaceLog (qp_interface_log)
├── id: Int (PK, auto)
├── traceId: String (UUID, 36)
├── system: String (20) — "QSP", "SEKO" 등
├── direction: String (10) — "OUTBOUND", "INBOUND"
├── apiName: String (50) — "login", "userDetail" 등
├── method: String (10) — "GET", "POST"
├── requestUrl: String (2000)
├── requestBody: String? (Text) — 민감정보 마스킹
├── responseStatus: Int — HTTP 상태코드
├── responseBody: String? (Text)
├── resultCode: String? (10) — "S", "F" 등
├── durationMs: Int — 소요시간(ms)
├── callerRoute: String (255) — "[POST /api/auth/login]" 등
├── userId: String? (255)
├── userType: String? (20)
├── errorMessage: String? (500)
├── createdAt: DateTime (default: now())
└── createdBy: String (255, default: "SYSTEM")

@@index([traceId])
@@index([system, apiName, createdAt])
@@index([callerRoute, createdAt])
@@index([resultCode])
@@map("qp_interface_log")
```

---

## 2. 로깅 유틸리티 — `src/lib/interface-logger.ts`

### 2.1 인터페이스

```typescript
type InterfaceLogParams = {
  system: string;          // "QSP" | "SEKO" 등
  direction: "OUTBOUND" | "INBOUND";
  apiName: string;         // QSP_API 키명 (login, userDetail 등)
  callerRoute: string;     // "[POST /api/auth/login]"
  userId?: string;
  userType?: string;
};

/** QSP 등 외부 API 호출 + 자동 로깅 */
async function fetchWithLog(
  url: string,
  init: RequestInit,
  params: InterfaceLogParams,
): Promise<Response>;
```

### 2.2 동작 흐름

1. `traceId` = `crypto.randomUUID()`
2. `startTime` = `performance.now()`
3. `requestBody` = init.body (password 필드 마스킹)
4. `fetch(url, init)` 실행
5. `durationMs` = `performance.now() - startTime`
6. `response.clone()` → `responseBody` 추출, `resultCode` 파싱
7. **fire-and-forget**: `prisma.qpInterfaceLog.create(...)` — 로그 실패해도 본 응답 반환
8. 원본 `Response` 반환

### 2.3 민감정보 마스킹

| 필드 | 마스킹 규칙 |
|------|-------------|
| password, pwd, newPwd, curPwd | `"***"` |
| email | 앞 1자 + `***` + `@domain` |
| request_url의 email 파라미터 | 동일 |

### 2.4 에러 시 처리

- fetch 자체 실패 (네트워크 등): responseStatus=0, errorMessage에 에러 메시지 기록 후 에러 re-throw
- 로그 insert 실패: console.error로 기록, 본 요청 흐름에 영향 없음

---

## 3. API Specification

### 3.1 `GET /api/tests/interface-log` — 목록 조회 (관리자 전용)

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| system | string | - | 시스템 필터 (QSP, SEKO 등) |
| apiName | string | - | API명 필터 |
| resultCode | string | - | 결과코드 필터 (S, F) |
| from | string (ISO) | - | 시작일시 |
| to | string (ISO) | - | 종료일시 |
| page | number | 1 | 페이지 |
| limit | number | 20 | 페이지 크기 |

**Response (200):**
```json
{
  "data": [
    {
      "id": 12,
      "traceId": "79d3b2c4-...",
      "system": "QSP",
      "direction": "OUTBOUND",
      "apiName": "userDetail",
      "method": "GET",
      "requestUrl": "https://jp-dev.qsalesplatform.com/api/...",
      "responseStatus": 200,
      "resultCode": "S",
      "durationMs": 126,
      "callerRoute": "[GET /api/mypage/profile]",
      "userId": "test1",
      "userType": "GENERAL",
      "errorMessage": null,
      "createdAt": "2026-04-12T15:48:04.351Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "totalPages": 1
  }
}
```

**비즈니스 로직:**
- requestBody, responseBody는 목록에서 제외 (용량)
- createdAt DESC 정렬

### 3.2 `GET /api/tests/interface-log/:id` — 상세 조회 (관리자 전용)

**Response (200):**
```json
{
  "data": {
    "id": 12,
    "traceId": "79d3b2c4-...",
    "system": "QSP",
    "direction": "OUTBOUND",
    "apiName": "userDetail",
    "method": "GET",
    "requestUrl": "https://jp-dev.qsalesplatform.com/api/...",
    "requestBody": null,
    "responseStatus": 200,
    "responseBody": "{\"result\":{\"resultCode\":\"S\",...}}",
    "resultCode": "S",
    "durationMs": 126,
    "callerRoute": "[GET /api/mypage/profile]",
    "userId": "test1",
    "userType": "GENERAL",
    "errorMessage": null,
    "createdAt": "2026-04-12T15:48:04.351Z",
    "createdBy": "SYSTEM"
  }
}
```

---

## 4. QSP 호출 지점 적용 매핑

| # | 파일 | QSP API | fetchWithLog apiName |
|---|------|---------|---------------------|
| 1 | auth/login/route.ts | QSP_API.login | "login" |
| 2 | auth/signup/route.ts | QSP_API.newUserReq | "newUserReq" |
| 3 | auth/email/check/route.ts | QSP_API.userDetail | "userDetail" |
| 4 | auth/password-reset/request/route.ts | QSP_API.userDetail | "userDetail" |
| 5 | auth/password-reset/confirm/route.ts | QSP_API.userPwdChg | "userPwdChg" |
| 6 | auth/password-init/route.ts | QSP_API.userPwdChg | "userPwdChg" |
| 7 | auth/two-factor/verify/route.ts | QSP_API.updateSecAuthDt | "updateSecAuthDt" |
| 8 | mypage/profile/route.ts (GET) | QSP_API.userDetail | "userDetail" |
| 9 | mypage/profile/route.ts (PUT) | QSP_API.updateUserDtl | "updateUserDtl" |
| 10 | mypage/password-change/route.ts | QSP_API.userPwdChg | "userPwdChg" |
| 11 | admin/members/route.ts | QSP_API.userListMng | "userListMng" |
| 12 | admin/members/[id]/route.ts | QSP_API.updateUserDtlMng | "updateUserDtlMng" |

**적용 방식**: 기존 `fetch(QSP_API.xxx, ...)` → `fetchWithLog(QSP_API.xxx, ..., params)`로 교체

---

## 5. Zod Schemas — `src/lib/schemas/interface-log.ts`

```typescript
// 목록 조회 쿼리 파라미터
const interfaceLogQuerySchema = z.object({
  system: z.string().optional(),
  apiName: z.string().optional(),
  resultCode: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
```

---

## 6. Implementation Order

1. Prisma 스키마에 `QpInterfaceLog` 모델 추가 → `prisma db push`
2. `src/lib/schemas/interface-log.ts` — Zod 스키마
3. `src/lib/interface-logger.ts` — fetchWithLog 유틸리티
4. `src/app/api/tests/interface-log/route.ts` — GET 목록 조회
5. `src/app/api/tests/interface-log/[id]/route.ts` — GET 상세 조회
6. 12개 QSP 호출 지점에 fetchWithLog 적용
7. `src/lib/openapi.ts` 업데이트
8. 테스트: API 호출 후 DB 기록 확인
