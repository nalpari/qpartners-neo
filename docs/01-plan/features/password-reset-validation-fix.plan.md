# Password Reset 검증 결함 수정 (Redmine #2156) Planning Document

> **Summary**: 비밀번호 초기화 시 (1) 등록된 GENERAL 회원을 "미존재"로 판정하는 False Negative + (2) loginId 와 email 이 동일 회원에 매칭되지 않는데 발송 처리되는 STORE False Positive 결함 동시 수정. QSP `userDetail` mapper 의 email-우선 매칭 동작에 의존하지 않도록 클라이언트 측 검증 로직을 userTp 별로 분기 + SEKO 화면 단일 입력란화 + GENERAL 라벨 변경.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-06
> **Status**: Draft
> **Redmine**: [#2156 — [비밀번호 초기화] DB에 등록된 회원정보인지 검증필요](http://gw.interplug.co.kr:43333/issues/2156)
> **Branch**: `fix/password-reset-validation-2156` (예정)
> **Predecessors**:
>   - `docs/01-plan/features/password-reset.plan.md` (v0.3, 2026-04-03) — 본 결함 수정의 모태 기능 Plan
>   - 메모리 `project_qsp_user_detail_general_mismatch.md` (2026-04-27) — QSP mapper email 우선 매칭 동작 확정
>   - 메모리 `project_qsp_bc_qp_user_email_encrypted.md` — BC_QP_USER e_mail 컬럼 암호화 저장 사실
>   - QPartners-neo 1차 조치(commit 미상, 2026-05-03 #2-#5) — 미존재 시 404 + 일본어 안내 메시지 통일

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | (1) 등록된 GENERAL 회원(`rjy1537@naver.com`) 입력 시 "회원 정보 없음" 알림 → 메일 미발송. (2) 판매점 ID(`A03`) + 다른 회원의 email(`kjy0501@nate.com`) 입력 시 "발송됨" 알림 → 의도치 않은 회원에게 메일 발송 가능. (3) 시공점 화면이 사양과 달리 sekoId+email 두 칸으로 구성. |
| **Solution** | userTp 3종 검증 정책 명문화 + 클라이언트 측 분기 구현. STORE = `loginId` 단독 조회 후 응답 `email` 평문이 입력 email 과 일치할 때만 통과(AND). SEKO = `email` 단독 조회 hit 통과 + 화면 단일 입력란화. GENERAL = 입력값 X 를 `loginId` 단독 + `email` 단독 두 번 병렬 조회, 어느 한쪽이라도 hit 시 통과(OR). |
| **Function/UX Effect** | 등록된 회원은 정확히 발송 / 미등록 또는 매칭 실패는 정확히 차단. 사양과 화면 일치(SEKO 입력란 1개). GENERAL 라벨 정확화(`ID または E-Mail`). |
| **Core Value** | Redmine #2156 의 두 false 결함(N + P) 동시 종결. 인접 라우트(`email/check`)와 동일한 dual-key 패턴으로 일관된 QSP mapper 우회 정책 정착. |

---

## 1. Overview

### 1.1 Purpose

비밀번호 초기화 요청 시 입력값과 QSP 회원 데이터의 매칭 정확도를 보장한다. 핵심 결함 두 건을 단일 PR 로 동시 해결하여 테스터 재현 케이스 모두 통과시킨다.

### 1.2 Background

#### 결함 발생 메커니즘

QSP `/api/qpartners/user/detail` mapper 동작 (담당자 회신, 2026-04-27 메모리 확정):

> "email 이 함께 전달되면 QSP 가 email 우선 매칭으로 동작하여, 동일 email 을 가진 회원이 다수일 경우 selectOne() 이 TooManyResultsException 으로 실패한다. email 매칭은 비밀번호 초기화 흐름 전용이며, 일반 조회에서는 보내지 말아야 한다."

→ password-reset/request 라우트는 "비밀번호 초기화 흐름" 으로 분류되어 mapper 가 의도한 email 우선 매칭을 그대로 사용하고 있으나, 다음 두 데이터 분포가 결합돼 결함이 발생한다:

1. **GENERAL 회원의 동일 email 다수 케이스** → mapper `selectOne()` 실패 → `resultCode="E"` → 코드 `route.ts:147` `userExists = (resultCode === "S")` 에서 false 처리 → **등록된 회원도 미존재 응답**
2. **STORE 회원에 대해 입력 loginId 와 다른 email 을 입력한 경우** → mapper 가 email 우선 매칭으로 다른 회원에 hit → loginId 무력화 → **A03 와 무관한 회원이 매칭, 입력 email 로 메일 발송**

#### 인접 라우트 선례

`src/app/api/auth/email/check/route.ts` 는 동일 mapper 한계로 이미 dual-key 패턴(loginId 단독 + email 단독 병렬 호출, 어느 쪽이든 hit 또는 `resultCode=E` 면 409)으로 우회 적용 완료 (2026-04-28). 본 PR 은 이 패턴을 password-reset 흐름의 검증 정책에 맞게 재구성한다.

#### STORE 응답에 email 평문이 포함된다는 사실 검증 (선행 블로커 해소, 2026-05-06)

- `src/lib/schemas/mypage.ts:113` `email: z.string().nullable()` — 평문 문자열로 정의
- `src/app/api/mypage/profile/route.ts:163` `email: d.email` — 운영 트래픽에서 정상 사용 중
- `qp_interface_log` id=62524/62521/62475 (dev) — STORE userDetail 응답에 `"email":"r***@interplug.co.kr"` 마스킹된 형태로 저장됨. 마스킹 함수(`maskEmail`)는 평문을 입력받아 처리하는 구조이므로, 마스킹된 형태로 보인다는 것 자체가 평문이 응답에 있었다는 증거.
- BC_QP_USER `e_mail` 컬럼은 DB 에서 암호화 저장이지만, **QSP API 가 응답 시 복호화하여 평문으로 내려줌**

→ STORE 케이스에서 `userDetail` 응답의 `data.email` 을 입력 email 과 비교 검증하는 것이 가능함이 확정됨.

### 1.3 Non-goals

- 자체 DB(`qp_signup_user` 등) 기반 회원 매칭 도입 — AS-IS 회원 마이그레이션 정책 미확정으로 위험. 본 PR 은 **QSP `userDetail` 단독 + 사후 매칭** 으로만 처리.
- 사용자 열거(User Enumeration) 방어 강화 — 메모리 정책상 후순위(IP/email rate limit 으로 일부 완화 중). 별도 PR.
- QSP mapper 자체 수정 — 외부 영역. 본 PR 은 클라이언트 측 우회.
- 2차 인증(`two-factor/*`) — 본 결함과 무관.

---

## 2. Scope

### 2.1 In Scope

#### 백엔드 — `src/app/api/auth/password-reset/request/route.ts`
- [ ] QSP `userDetail` 호출을 userTp 별로 분기:
  - **STORE**: `?accsSiteCd&loginId&userTp=STORE` (email 미전송) → 응답 `data.email` 평문이 입력 `email` 과 일치할 때만 `userExists=true`
  - **SEKO**: `?accsSiteCd&email&userTp=SEKO` (loginId/sekoId 미전송) → hit 시 `userExists=true`
  - **GENERAL**: 입력값 X 에 대해 `?loginId=X&userTp=GENERAL` AND `?email=X&userTp=GENERAL` 두 번 병렬 호출 → 어느 한쪽이든 hit 시 `userExists=true`
- [ ] mismatch 케이스(loginId hit 했지만 email 불일치 등) 로깅 — PII 제외 + 디버깅 컨텍스트 포함
- [ ] `resultCode="E"` (TooManyResults) 케이스는 fail-closed (현재와 동일하게 false 유지) + `console.error` 운영 알림
- [ ] 미존재 응답 메시지 일관성 유지 — `"一致する会員情報がありません。入力情報を再度ご確認ください。"` (현행 유지)

#### 프론트 — `src/components/popup/password-reset-popup.tsx`
- [ ] **SEKO 탭**: `施工店ID` 입력란 제거 → `E-Mail*` 1개만 표시
- [ ] **GENERAL 탭**: 라벨 `ID(E-Mail)` → `ID または E-Mail` 변경, 입력 타입 `email` → `text` 변경 (loginId 도 받을 수 있도록), `idEmail` state 키 그대로 유지 또는 `idOrEmail` 로 리네임
- [ ] `isFormValid` 의 SEKO 분기 수정 (`sekoId` 제거)
- [ ] `handleSubmit` payload 빌드 — SEKO 는 `email` 만, GENERAL 은 입력값을 그대로 백엔드로 전달

#### 스키마 — `src/lib/schemas/password-reset.ts`
- [ ] `passwordResetRequestSchema.superRefine` 수정:
  - SEKO 는 `email` 만 필수 (sekoId 제거)
  - STORE 는 `loginId` + `email` 둘 다 필수 (현행 유지 + email 명시)
  - GENERAL 은 단일 입력값 1건 필수 (loginId 또는 email 어느 쪽이든) — payload 형태는 백엔드 호환을 위해 결정 필요 (4.x 절 참조)
- [ ] 응답 스키마 — `qspUserDetailSchema` 의 `email` 평문 필드를 STORE 매칭에 사용 (재사용)

#### OpenAPI — `src/lib/openapi.ts`
- [ ] `POST /api/auth/password-reset/request` 의 request body 스키마/description 업데이트:
  - SEKO 의 `sekoId` 필드 제거
  - GENERAL 의 입력 의미 명문화 (loginId 또는 email 둘 중 하나)

### 2.2 Out of Scope

- `password-reset/verify`, `password-reset/confirm` 라우트 — 본 결함과 무관 (토큰 기반)
- `password-init` 라우트 — 세션 기반, 본 결함과 무관
- 이메일 템플릿, 메일 발송 인프라
- 2차 인증
- 자체 DB 매칭 (1.3 Non-goals 참조)
- RLS / RBAC

---

## 3. Requirements

### 3.1 검증 매트릭스 (확정 사양)

| userTp | 화면 입력 | 백엔드 검증 | 통과 조건 |
|---|---|---|---|
| **STORE** (1차/2차 판매점) | `loginId` + `email` (둘 다 필수) | QSP `?loginId={loginId}&userTp=STORE` (email 미전송) | 응답 `resultCode="S"` AND `data.email` 평문 == 입력 `email` |
| **SEKO** (시공점) | `email` 만 필수 | QSP `?email={email}&userTp=SEKO` | 응답 `resultCode="S"` AND `data` 1건 |
| **GENERAL** (일반회원) | `loginId` **또는** `email` 단일 입력 | 입력값 X 에 대해 `?loginId=X&userTp=GENERAL` AND `?email=X&userTp=GENERAL` 두 번 병렬 호출 | 어느 한쪽이라도 `resultCode="S"` AND `data` 1건 |

추가 fail-closed 정책:

| 응답 패턴 | 처리 |
|---|---|
| `resultCode="S"` + `data` 1건 + 매칭 일치 | `userExists=true` → 토큰 생성 + 메일 발송 |
| `resultCode="F_NOT_USER"` 또는 `data=null` | `userExists=false` → 404 + 일본어 안내 |
| `resultCode="E"` (TooManyResultsException) | `userExists=false` (현행 유지) + `console.error` 운영 알림 |
| HTTP 비정상 / 스키마 불일치 / 타임아웃 | 502 + 일본어 안내 (현행 유지) |

### 3.2 화면 사양 (확정)

| 탭 | 현재 | 수정 후 | 비고 |
|---|---|---|---|
| dealer (STORE) | ID + E-Mail | 동일 | **변경 없음** |
| installer (SEKO) | 施工店ID(선택) + E-Mail*(필수) | E-Mail*(필수) 1개만 | sekoId 입력란 + 라벨 제거 |
| general (GENERAL) | "ID(E-Mail)" 단일 입력 (type=email) | "ID または E-Mail" 단일 입력 (type=text) | 라벨 변경 + 타입 변경 |

### 3.3 Functional Requirements

| ID | Requirement | Priority | 비고 |
|---|---|---|---|
| FR-01 | STORE: loginId + email 둘 다 동일 회원에 매칭될 때만 통과 | High | 본 PR 의 핵심 결함 #2 해결 |
| FR-02 | SEKO: email 단독 조회 hit 시 통과 | High | 화면도 단일 입력란 |
| FR-03 | GENERAL: loginId 또는 email 어느 한쪽 매칭 시 통과 (OR) | High | 본 PR 의 핵심 결함 #1 해결 |
| FR-04 | 미존재/매칭 실패는 동일한 일본어 메시지 + 404 | High | 현행 유지 |
| FR-05 | TooManyResults(`E`) 는 fail-closed + 운영 알림 | Medium | 모니터링 필요 |
| FR-06 | SEKO 화면에 sekoId 입력란 비표시 | High | popup 컴포넌트 수정 |
| FR-07 | GENERAL 라벨 `ID または E-Mail` | High | popup 컴포넌트 수정 |
| FR-08 | OpenAPI 스펙과 실제 동작 일치 | Medium | `.claude/rules/api.md` 준수 |

### 3.4 Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-01 | GENERAL 의 두 번 병렬 호출은 `Promise.all` 로 묶어 응답 시간 영향 최소화 (단일 호출 대비 ~동등) | Medium |
| NFR-02 | PII 미로깅 (`maskEmail` 적용 — 현행 유지) | High |
| NFR-03 | rate limit (IP + email) 현행 유지 — 두 번 병렬 호출되어도 토큰 생성 시점 1회만 카운트 | High |
| NFR-04 | 응답 시간: 정상 케이스 ≤ 5s 유지 (현행 timeout 10s 유지) | Medium |

---

## 4. API Contract

### 4.1 Request Body 변경 (스키마 superRefine)

**현재**:
```ts
{
  userTp: "STORE" | "SEKO" | "GENERAL" | "ADMIN",
  loginId?: string,
  email: string,         // 항상 필수
  sekoId?: string,       // SEKO 선택
}
+ STORE: loginId 필수 (superRefine)
```

**변경 후**:
```ts
{
  userTp: "STORE" | "SEKO" | "GENERAL" | "ADMIN",
  loginId?: string,
  email?: string,        // GENERAL 에서 미입력 가능
  // sekoId 제거
}
+ STORE: loginId AND email 필수
+ SEKO:  email 필수, loginId 없어야 함
+ GENERAL: loginId XOR email 정확히 한 쪽만 필수 (둘 다 없으면 invalid, 둘 다 있어도 invalid)
```

**대안 — GENERAL 입력 단일화 옵션 비교**:

| 옵션 | payload 형태 | 장점 | 단점 |
|---|---|---|---|
| **(가) 백엔드가 분기** | 화면이 입력값 형태 검사 후 `loginId` 또는 `email` 필드에 넣어 전송 | 백엔드는 단순 | 화면이 email 정규식 검사 책임 가짐 |
| **(나) 단일 입력 필드 도입** | 새 필드 `idOrEmail` 로 화면이 입력값 그대로 전송, 백엔드가 두 번 호출 | 화면 단순 / 의도 명확 | 스키마/OpenAPI 변경 폭 큼 |

→ **권장 (가)**: 화면이 email 형식이면 `email` 필드, 아니면 `loginId` 필드로 보내기. 단, **GENERAL 만은 양쪽 다 시도하므로 어느 필드로 와도 백엔드가 두 번 병렬 호출** (입력값을 loginId·email 양쪽으로 시도). 이 경우 백엔드는 `userTp=GENERAL` 일 때 `loginId ?? email` 을 단일 입력값으로 받아 두 번 호출. 화면은 email 정규식 검사 없이 그냥 `loginId` 필드에 채워 보내도 됨 (백엔드가 양쪽 다 시도하므로 무관).

→ **최종**: 화면에서는 GENERAL 입력값을 `loginId` 필드로 통일해 전송. 백엔드는 GENERAL 분기에서 입력값을 `loginId` 와 `email` 양쪽으로 시도. (화면 단순화 + 백엔드 분기 명확화)

### 4.2 Response 변경 없음

응답 형태는 현행 유지:
- 200: `{ data: { message: "パスワード変更リンクをメールで送信しました。" } }`
- 400: Zod 검증 실패 (메시지는 미존재와 동일하게 통일 — 현행 유지)
- 404: `{ error: "一致する会員情報がありません。入力情報を再度ご確認ください。" }`
- 429: rate limit
- 500: 토큰 생성 실패 / 메일 발송 실패
- 502: QSP 비정상

### 4.3 OpenAPI 업데이트 항목

- `passwordResetRequest` 스키마: `sekoId` 필드 제거
- description 에 userTp 별 입력 정책 명시
- 예시(`example`) 도 3종 분리 (STORE / SEKO / GENERAL)

---

## 5. Process Flow

### 5.1 STORE 흐름

```
[화면 dealer 탭] loginId + email 입력
    │
    ▼
[Zod] STORE: loginId + email 둘 다 필수
    │
    ▼
[Rate limit] IP + email 검사
    │
    ▼
[QSP userDetail] ?loginId={loginId}&userTp=STORE  (email 미전송)
    │
    ├── resultCode=S, data 존재
    │     │
    │     ▼
    │   [사후 매칭] data.email 평문 == 입력 email ?
    │     ├── YES → userExists=true → 토큰 생성 + 메일 발송 → 200
    │     └── NO  → userExists=false → 404 (일관 메시지)
    │
    ├── resultCode=F_NOT_USER → 404
    ├── resultCode=E (TooManyResults) → 404 + console.error
    └── HTTP 비정상 → 502
```

### 5.2 SEKO 흐름

```
[화면 installer 탭] email 입력 (단일 입력란)
    │
    ▼
[Zod] SEKO: email 필수
    │
    ▼
[Rate limit]
    │
    ▼
[QSP userDetail] ?email={email}&userTp=SEKO
    │
    ├── resultCode=S, data 존재 → 토큰 + 메일 → 200
    ├── resultCode=F_NOT_USER → 404
    ├── resultCode=E → 404 + console.error
    └── HTTP 비정상 → 502
```

### 5.3 GENERAL 흐름

```
[화면 general 탭] 단일 입력 X (라벨 "ID または E-Mail")
    │
    ▼
[화면 → payload] { userTp: "GENERAL", loginId: X }  (email 필드 비우고 loginId 로 전송)
    │
    ▼
[Zod] GENERAL: loginId XOR email 정확히 한 쪽 필수
    │
    ▼
[Rate limit] (loginId 또는 email 어느 쪽으로 들어왔든 입력값 X 기준)
    │
    ▼
[QSP userDetail × 2 병렬]
    ├── ?loginId=X&userTp=GENERAL  → A
    └── ?email=X&userTp=GENERAL    → B
    │
    ▼
[OR 매칭] A.hit OR B.hit ?
    ├── YES → userExists=true → 토큰 생성 (userId=email 또는 loginId 정규화 필요) → 메일 → 200
    └── NO  → userExists=false → 404 (일관 메시지)
```

#### 5.3.1 토큰 저장 시 `userId` 정규화

현재 `passwordResetToken.userId` 는 입력 `email` 을 저장(`route.ts:184, 190`). GENERAL 에서 입력값이 loginId 인 경우에도 토큰 검증·메일 발송은 **email 기준** 으로 동작해야 한다. → GENERAL 매칭 통과 시 응답 데이터의 `data.email` 을 추출하여 토큰의 `userId` 와 메일 수신자로 사용. (loginId 매칭 hit 했더라도 `data.email` 이 응답에 있으므로 추출 가능 — 4.1 의 STORE 사후 매칭 로직과 동일하게 응답 email 평문 필드를 사용)

→ 단, GENERAL 의 `data.email` 이 입력값과 다를 수도 있음 (loginId ≠ email). 메일은 응답 email 로 발송하는 것이 정합. 단위테스트에서 명시.

### 5.4 Rate limit 영향 분석

현재 `route.ts:60-95`:
- IP + email 기반 rate limit
- 토큰 카운트 기반 rate limit (시간당 3회)

GENERAL 의 두 번 병렬 호출이 추가돼도:
- IP rate limit: 1 request 단위로 카운트 (병렬 QSP 호출은 외부 호출 횟수일 뿐 본 라우트의 rate limit 과 무관)
- 토큰 카운트: 매칭 성공 1회당 토큰 1건 (현행 유지)

→ Rate limit 정책 변경 불필요.

---

## 6. Test Scenarios (재현 + 회귀)

### 6.1 결함 재현 케이스 (Redmine #2156 보고)

| # | 입력 | 기대 결과 (수정 후) | 현재 결과 (수정 전) |
|---|---|---|---|
| T-1 | GENERAL: `rjy1537@naver.com` (등록된 일반회원) | **200 + 메일 발송** | 404 ("회원 정보 없음") |
| T-2 | STORE: loginId=`A03` + email=`kjy0501@nate.com` (loginId/email 동일 회원에 매칭 안 됨) | **404 (차단)** | 200 ("발송됨") |
| T-3 | GENERAL: `kkk@dd.dd` (미등록 이메일) | 404 (현행 유지) | 404 (1차 조치 완료) |

### 6.2 회귀 테스트

| # | 입력 | 기대 결과 |
|---|---|---|
| T-4 | STORE: loginId + email 모두 일치 등록 회원 | 200 + 메일 발송 |
| T-5 | STORE: loginId 등록 + email 빈 값 | 400 (Zod) |
| T-6 | STORE: loginId 등록 + email 다른 회원 것 | 404 (mismatch) |
| T-7 | SEKO: 등록 email | 200 + 메일 발송 |
| T-8 | SEKO: 미등록 email | 404 |
| T-9 | GENERAL: 등록된 loginId (loginId ≠ email 케이스) | 200 + 메일은 응답 data.email 로 발송 |
| T-10 | GENERAL: 등록된 email | 200 + 메일 발송 |
| T-11 | GENERAL: 입력값 비어있음 | 400 (Zod) |
| T-12 | TooManyResults 케이스 (GENERAL) | 404 + console.error 로깅 |

### 6.3 RETEST 대상 (Redmine 회신용)

- T-1: `rjy1537@naver.com` → 발송 성공 스크린샷
- T-2: A03 + kjy0501@nate.com → "회원 정보 없음" 알림 스크린샷
- 부가: T-9 의 loginId 입력 케이스 (사용자 정정 사양 반영 증명)

---

## 7. Affected Files

| 파일 | 변경 유형 | 비고 |
|---|---|---|
| `src/app/api/auth/password-reset/request/route.ts` | Modify | userTp 분기 + 사후 매칭 + GENERAL 병렬 호출 |
| `src/lib/schemas/password-reset.ts` | Modify | superRefine 정책 재정의 (sekoId 제거 포함) |
| `src/components/popup/password-reset-popup.tsx` | Modify | SEKO 입력란 단일화, GENERAL 라벨/타입 변경, payload 빌드 변경 |
| `src/lib/openapi.ts` | Modify | passwordResetRequest 스펙 동기화 |
| `docs/02-design/features/password-reset-validation-fix.design.md` | Create | 본 PR 의 Design 문서 |
| `docs/03-analysis/password-reset-validation-fix.analysis.md` | Create (Check 단계) | Gap 분석 + 재현 결과 |

추가 검토(코드 미수정 가능):
- `src/lib/schemas/signup.ts` `qspResponseSchema` — STORE 사후 매칭 시 `data.email` 추출 필요. 현재 `data: z.unknown().nullable()` 이므로 `qspUserDetailSchema` 또는 별도 좁은 스키마로 좁혀야 안전 (Design 단계 결정).

---

## 8. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| GENERAL 병렬 호출이 QSP 부하 증가 | Low | Low | 한 사용자당 1요청 = 2 호출, 기존 트래픽 패턴(rate limit 제어) 내 |
| STORE 응답 `data.email` 이 향후 누락될 가능성 | Low | High | `qspUserDetailSchema` 가 `email: z.string().nullable()` 이라 null 시 mismatch 처리 → fail-closed 안전 |
| GENERAL 의 loginId 입력 케이스에서 `data.email` 이 응답 안 옴 | Low | Medium | 토큰·메일 수신자가 비어 fail. 응답 검증 후 `data.email` null → 404 fail-closed 처리 |
| 화면 변경(SEKO 단일화)이 기존 사용자 시나리오와 다름 | Low | Low | 화면설계서 v1.1 / 사용자 정정 사양 우선 — 사용자 컨펌 완료 |
| QSP mapper 동작 변경 (담당자 영역) | Very Low | High | 본 PR 은 mapper 동작에 의존하지 않는 사후 매칭 + dual-key 구조 — 결합도 최소화 |
| `kjy0501@nate.com` 이 BC_QP_USER 의 다른 STORE 회원 email 인 경우 false positive 메커니즘 (현재 결함의 근거) | (사실 — 가설 아님) | High | 본 PR 의 STORE 사후 매칭으로 차단 |

---

## 9. Implementation Order

| 순서 | 작업 | 난이도 | 비고 |
|---|---|---|---|
| 1 | Design 문서 작성 (`password-reset-validation-fix.design.md`) | 중간 | 코드 변경 의사코드 + 화면 변경 mock-up + Zod 스키마 변경 명세 |
| 2 | 새 브랜치 생성 (`fix/password-reset-validation-2156`, base=development) | 낮음 | 메모리 정책: development 머지 대상 |
| 3 | 백엔드 분기 구현 (`request/route.ts`) | 중간 | userTp 별 분기 + GENERAL 병렬 + STORE 사후 매칭 |
| 4 | Zod 스키마 변경 (`password-reset.ts`) | 낮음 | superRefine 재정의 |
| 5 | 화면 수정 (`password-reset-popup.tsx`) | 낮음 | SEKO 단일화, GENERAL 라벨 |
| 6 | OpenAPI 동기화 (`openapi.ts`) | 낮음 | spec ↔ 동작 일치 |
| 7 | 린트·타입·빌드 (서브에이전트) | 낮음 | `pnpm lint && tsc && build` |
| 8 | dev 환경 재현 테스트 (T-1~T-12) | 중간 | dev DB 상의 실회원 사용 |
| 9 | 분석 문서 (`password-reset-validation-fix.analysis.md`) — Check 단계 | 중간 | gap-detector 결과 + Match Rate |
| 10 | Redmine 회신 (RETEST 대상자에게 결과 + 스크린샷) | 낮음 | 김 지영 / 류 제영 / 김 창수 |

---

## 10. Definition of Done

- [ ] T-1 ~ T-12 모두 기대 결과로 통과
- [ ] `pnpm lint` 오류 0 (경고 최소화 노력)
- [ ] `pnpm tsc --noEmit` 오류 0
- [ ] `pnpm build` 성공
- [ ] OpenAPI 스펙 ↔ route.ts 동작 일치 (`.claude/rules/api.md` 준수)
- [ ] PII 미로깅 — `maskEmail` 적용 유지
- [ ] Match Rate ≥ 90% (gap-detector 기준, Check 단계)
- [ ] Redmine #2156 에 결과 회신 + 스크린샷 첨부 + 상태 변경 (조치완료)

---

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-05-06 | Initial draft (Redmine #2156 결함 분석 + 검증 매트릭스 확정 + STORE 응답 email 평문 검증 완료) | CK |
