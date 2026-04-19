# 대량메일 발송 처리 Planning Document

> **Summary**: 대량메일 비동기 발송 — 수신자 테이블 + Fire-and-Forget 패턴
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-16
> **Status**: Draft
> **선행 문서**: [mass-mail.plan.md](mass-mail.plan.md) (CRUD — 구현 완료)
> **화면설계서**: p.48-50

---

## 1. Overview

관리자가 발송 버튼 클릭(status=pending) 시 즉시 응답을 반환하고,
서버에서 비동기로 발송대상 이메일 수집 → 수신자 테이블 INSERT → 순차 발송을 처리한다.
사용자는 발송 시작 확인 후 자유롭게 다른 업무를 수행할 수 있다.

### 핵심 결정사항
- **비동기 즉시 발송 + 3분 배치 자동 복구 (이중 안전망)**
  - 1단계: POST/PUT 시 즉시 비동기 발송 트리거 (Fire-and-Forget) — 즉시성 유지
  - 2단계: 3분 cron 배치 — 못 보낸 수신자(`status=pending`) 자동 재시도, 좀비(`status=sending`) 자동 복구
  - v0.4 결정 번복: 기존 v0.3은 "3분 배치 불필요" 였으나 운영 사고 방지(서버 크래시 좀비, send_failed 수동 개입 부담)를 위해 도입. AS-IS `mail_sending.php` 도 동일한 3분 cron 패턴.
- **recipient.retry_count 컬럼** — 30초 룰(3회 in-batch 시도) 누적. retry_count == 3 이면 영구 실패(`status=failed`).
- **mass_mail.status 자동 갱신** — 모든 recipients 가 sent/failed 로 종결되면 자동으로 sent 전이 (집계 완료).
- **수신자 테이블** — 건별 발송 상태 추적, 실패 건 재발송, 중단 복구
- **시공점(SEKO)은 1차 제외** — AS-IS Seko User List API 미확보

---

## 2. Scope

### 2.1 In Scope
- [ ] 수신자 테이블 (qp_mass_mail_recipients) 추가
- [ ] MailStatus enum에 "sending" 추가
- [ ] qp_mass_mails에 발송 집계 컬럼 추가 (sent_total/sent_success/sent_failed)
- [ ] 발송대상 이메일 수집 함수 (QSP userListMng 기반)
- [ ] 비동기 발송 실행 함수 (Fire-and-Forget)
- [ ] POST/PUT에서 status=pending 시 비동기 발송 트리거
- [ ] 상세 API에 발송 결과 (성공/실패 건수) 포함
- [ ] 장애 복구: 자동 재시도 (3회) + 관리자 수동 재발송 API
- [ ] optOut 필터 (뉴스레터 수신거부 제외)
- [ ] **(v0.4 신규) 3분 배치 자동 복구**
  - [ ] `qp_mass_mail_recipients.retry_count` 컬럼 추가 (30초 룰 누적, 상한 3)
  - [ ] `src/instrumentation.ts` — Next.js 기동 시 3분 setInterval 등록
  - [ ] `src/lib/mass-mail/auto-retry-batch.ts` — pending recipient SELECT → 30초 룰 → mass_mail.status 자동 전이
  - [ ] `sendLoop` 에 retry_count 증분 + 30초 룰 적용 (개별 recipient 재시도)
  - [ ] mass_mail.status 자동 갱신 (모든 recipients 종결 시 sent 전이)
- [ ] **(v0.4 신규) 失敗確認 UI 노출**
  - [ ] GET `/api/admin/mass-mails/:id` 응답에 `failedRecipients[]` 추가 (기존 라우트 확장, 신규 API 없음) — 백엔드 PR
  - [ ] 목록 화면에서 `sent_failed > 0` 인 row 에 [失敗確認] 버튼 노출 — **프론트 별도 PR**
  - [ ] 클릭 시 모달 팝업으로 failed recipients 명단 표시 (이메일/이름/실패사유) — **프론트 별도 PR**

### 2.2 Out of Scope
- 시공점(SEKO) 발송 — AS-IS API 미확보 (API 확보 후 별도 작업)
- 발송 진행률 실시간 표시 — 프론트 미설계
- 메일 본문에 첨부파일 직접 첨부 — 다운로드 링크 방식 검토 필요 (PO 확인)
- 발송 취소 — 업무 프로세스상 취소 없음 (발송 후 되돌리기 불가)

### 2.3 삭제 정책 변경
- 임시저장(draft)만 삭제 가능
- 발송된 메일(sent/sending/send_failed)은 삭제 불가
- 기존 DELETE API에 상태 체크 추가 필요

### 2.4 중복 발송 방지
- 관리자가 [発送] 버튼을 빠르게 2번 클릭 시 동일 메일에 대해 비동기 처리가 중복 시작될 수 있음
- POST: 매번 새 레코드이므로 문제 없음
- PUT(draft→pending): 이미 pending/sending/sent 상태이면 발송 트리거 차단
- 상태 전이 시 낙관적 락(updateMany where status="draft") 으로 보장 (기존 TOCTOU 방어와 동일)

---

## 3. 아키텍처

### 3.1 발송 처리 흐름 (v0.4 — 비동기 + 3분 배치 이중 안전망)

```
관리자 [発送] 클릭
    │
    ▼
POST/PUT (status="pending")
    │
    ├─→ ① DB 저장 (status="pending")
    ├─→ ② 프론트에 즉시 응답 반환 { message: "メール送信を受け付けました" }
    └─→ ③ 비동기 처리 1회 시도 (Fire-and-Forget)
         │
         ▼
    ④ QSP userListMng 호출 (userTp별 전체 조회)
       → email 수집 + optOut 필터
         │
         ▼
    ⑤ qp_mass_mail_recipients bulk INSERT (status="pending", retry_count=0)
       + massMail.status = "sending"
         │
         ▼
    ⑥ recipients 순차 발송 (sendMail 루프, throttle)
       → 성공     : recipient.status="sent"
       → 실패     : recipient.retry_count++
         · retry_count == 3 → recipient.status="failed" + errorMessage
         · retry_count <  3 → recipient.status="pending" 유지 (배치가 처리)
         │
         ▼
    ⑦ recipients 모두 종결 (pending 0건):
       massMail.status="sent", massMail.sentAt=now()
       sent_success / sent_failed 갱신

──────────────────────────────────────────────────────────────────
[병렬] 3분 cron 배치 (서버 기동 시 setInterval 자동 등록)

매 3분마다:
    ⓐ pending recipients SELECT (mass_mail 단위로 grouping)
    ⓑ 각 recipient 에 대해:
        - 30초 룰: 시도 1 → 실패 시 30초 대기 → 시도 2 → ... → 시도 3
        - 시도마다 retry_count++
        - 어느 시도 성공 → status="sent"
        - 3회 모두 실패 → status="failed"
        - 30초 룰 도중 배치 종료 → status="pending" 유지 (다음 cycle 이 이어받음)
    ⓒ 처리 후 mass_mail 단위로 집계:
        - pending recipient 0건이면 mass_mail.status="sent" 자동 전이
        - sent_success / sent_failed 카운트 갱신
    ⓓ recipients 가 0건인 mass_mail (수집 자체 실패) → collectAndQueueRecipients 재호출
```

### 3.2 상태 전이 (v0.4)

**mass_mail.status**
```
draft ──[発送]──→ pending ──[수집 시작]──→ sending ──[모든 recipients 종결]──→ sent
                              │
                              └──[수집 실패 / 전체 장애]
                                   │
                                   └──[runWithRetry 3회 실패 시]──→ send_failed
                                            │
                                            └──[관리자 [再送信]]──→ sending → ...
```

**recipient.status (개별 row 상태 머신)**
```
(insert 시 default) pending ──[SMTP 성공]──→ sent
                            │
                            └──[SMTP 실패 + retry_count++]
                                  │
                                  ├─ retry_count <  3 → pending 유지 (배치가 다음 cycle 처리)
                                  └─ retry_count == 3 → failed (영구 실패, 추가 시도 없음)
```

**핵심 불변량**
1. `recipient.retry_count ≤ 3`
2. `recipient.retry_count == 3 → recipient.status ∈ {sent, failed}` (pending 아님)
3. `mass_mail.status == 'sent' ⇔ 모든 recipients.status ∈ {sent, failed}`
4. SMTP 시도 횟수 == retry_count (불변)

### 3.3 장애 복구 (3단계 안전망)

**1단계: in-process 자동 재시도** (`runWithRetry`)
- 발송 루프 전체 장애(SMTP 다운, DB 끊김 등) 발생 시
- 30초 간격으로 최대 3회 자동 재시도
- 서버가 살아있는 동안만 동작 (in-process)

**2단계: 3분 배치 자동 복구** (v0.4 신규, 핵심)
- 서버 기동 시 setInterval 로 등록 (instrumentation.ts)
- 매 3분마다 다음을 자동 수행:
  - `recipient.status='pending' AND retry_count < 3` 인 row → 30초 룰 (3회 재시도)
  - `mass_mail.status='sending' AND updated_at < NOW() - 10min` → 좀비 자동 감지
  - `mass_mail.status='pending' AND recipients 0건` → 수집부터 재시도
- 1단계가 커버 못하는 케이스를 모두 흡수:
  - 서버 재시작으로 1단계가 사라진 좀비
  - 일시 메일함 거부 (수 분 후 복구되는 케이스)
  - 수집 단계 QSP 일시 장애

**3단계: 관리자 수동 재발송** (`/api/admin/mass-mails/:id/retry`)
- 자동 재시도 3회까지 실패 → `mass_mail.status='send_failed'` (드물어짐, 옵션)
- [再送信] 버튼 → pending recipients 만 이어서 발송 재개

**3단계 모두 결합 시 보장**
- 일시 장애: 1단계 in-process 30초 × 3회 + 2단계 배치 9분 윈도우 → 자동 복구
- 영구 장애: retry_count == 3 으로 자동 마킹 → 무한 루프 없음
- 운영자 수동 개입: 거의 불필요 (필요 시 3단계 사용)

---

## 4. DB 변경

### 4.1 신규 테이블: qp_mass_mail_recipients

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT (PK, auto) | |
| mass_mail_id | INT (FK) | qp_mass_mails.id |
| email | VARCHAR(255) | 수신자 이메일 |
| user_name | VARCHAR(255) | 수신자명 (로그용, nullable) |
| auth_role | ENUM | SUPER_ADMIN/ADMIN/1ST_STORE/2ND_STORE/SEKO/GENERAL (화면 체크박스 6개와 1:1 대응, QSP authCd 기준) |
| status | ENUM | pending / sent / failed |
| sent_at | DATETIME | 발송 시각 (nullable) |
| error_message | VARCHAR(500) | 실패 사유 (nullable) |
| created_at | DATETIME | INSERT 시각 |
| created_by | VARCHAR(255) | 발송 트리거 관리자 (PR #60, nullable, legacy fallback: mail.user_id) |
| **retry_count** | **INT NOT NULL DEFAULT 0** | **(v0.4 신규) SMTP 시도 누적 횟수. 상한 3** |

인덱스: `@@index([mass_mail_id, status])` (배치가 SELECT WHERE status='pending' 자주 호출 → 활용)

### 4.2 기존 테이블 변경: qp_mass_mails

| 변경 | 컬럼 | 타입 | 설명 |
|------|------|------|------|
| enum 추가 | status | MailStatus | "sending", "send_failed" 추가 |
| 컬럼 추가 | sent_total | INT (default 0) | 발송 대상 수 |
| 컬럼 추가 | sent_success | INT (default 0) | 성공 건수 |
| 컬럼 추가 | sent_failed | INT (default 0) | 실패 건수 |

---

## 5. 이메일 수집

### 5.1 수집 방식 (1단계 — 목록 조회만)

QSP 회원관리 목록 API(userListMng)에 `storeLvl`(1/2)과 `newsRcptYn`(Y/N)이 추가되어
상세 API 개별 호출 없이 목록 조회만으로 필터 가능하다.

```
userTp별 목록 조회 (페이징 반복 호출)
  → email, userId, userTp, storeLvl, newsRcptYn, statCd 수집
  → 필터 적용
  → 수신자 테이블 bulk INSERT
```

### 5.2 수집 대상 매핑

```
화면 체크박스 → userTp + storeLvl 필터

targetSuperAdmin=true → userTp=ADMIN (추후 SUPER_ADMIN 구분 방식 확인 필요)
targetAdmin=true      → userTp=ADMIN
targetFirstStore=true → userTp=STORE + storeLvl="1"
targetSecondStore=true→ userTp=STORE + storeLvl="2"
targetGeneral=true    → userTp=GENERAL
targetConstructor=true→ 1차 제외 (SEKO API 미확보)
```

### 5.3 필터 조건 (수집 단계)

```
① statCd 활성 회원만 포함 (삭제/탈퇴 상태 제외)
② email null 또는 빈값 제외
③ optOut=false(수신거부 제외)인 경우 newsRcptYn="N" 회원 제외
④ STORE 유저는 storeLvl이 체크된 대상과 일치하는 것만 포함
⑤ email 기준 중복 제거 (동일인이 중복 조회되는 경우 첫 번째 auth_role 기록)
```

### 5.4 auth_role 결정 (수신자 테이블 기록용)

```
userTp=ADMIN       → auth_role = "ADMIN" (SUPER_ADMIN 구분은 추후)
userTp=STORE, lvl=1→ auth_role = "1ST_STORE"
userTp=STORE, lvl=2→ auth_role = "2ND_STORE"
userTp=GENERAL     → auth_role = "GENERAL"
userTp=SEKO        → auth_role = "SEKO" (1차 제외)
```

### 5.5 시공점 (SEKO) — 1차 제외

- AS-IS Seko User List API 미확보 (config.ts에 미등록)
- targetConstructor=true 시 로그 경고 + 스킵 처리
- API 확보 후 별도 작업

---

## 6. 발송 처리

### 6.1 SMTP

- 기존 `src/lib/mailer.ts` (nodemailer) 활용
- 개발환경: Ethereal 테스트 SMTP (SMTP_USE_ETHEREAL=true)
- 운영환경: 실제 SMTP (SMTP_HOST/USER/PASS)

### 6.2 Throttle

- SMTP rate limit 대응: 건별 100ms~500ms 간격 (설정 가능)
- 3,000건 × 200ms = 약 10분 소요 (허용 범위)

### 6.3 첨부파일

- 1차: 메일 본문만 발송 (첨부파일 미포함)
- 첨부파일 포함 발송은 PO 확인 후 결정
  - 파일 직접 첨부 vs 다운로드 링크

---

## 7. API 변경

### 7.1 POST /api/admin/mass-mails

- 기존: DB 저장만
- 변경: status="pending" 시 비동기 발송 트리거 추가

### 7.2 PUT /api/admin/mass-mails/:id

- 기존: draft만 수정
- 변경: status="pending" 으로 변경 시 비동기 발송 트리거 추가

### 7.3 POST /api/admin/mass-mails/:id/retry (재발송)

- 신규 API — send_failed 상태의 메일에 대해 재발송
- **[発送]과의 차이**:

```
[発送] 전체 과정:
  ① QSP API 호출 → 이메일 수집
  ② recipients 신규 INSERT
  ③ 전체 수신자 발송

[再送信] 이어서 발송만:
  ① ② 없음 (이미 테이블에 있음)
  ③ status="pending" 수신자만 발송
```

- 즉시 응답 + 비동기 처리 (발송 루프만 재실행)
- send_failed 상태에서만 호출 가능 (그 외 400)

### 7.4 GET /api/admin/mass-mails/:id (상세)

- 응답에 발송 결과 + 실패 수신자 명단 추가 (v0.4):
  ```json
  {
    "data": {
      ...기존 필드,
      "sentTotal": 3000,
      "sentSuccess": 2980,
      "sentFailed": 20,
      "failedRecipients": [
        {
          "email": "user@example.com",
          "userName": "山田太郎",
          "authRole": "ADMIN",
          "errorMessage": "550 5.1.1 mailbox not found",
          "lastAttemptAt": "2026-04-18T10:30:00.000Z"
        }
      ]
    }
  }
  ```
- `failedRecipients` 는 `recipient.status='failed'` 인 row 만 포함 (없으면 빈 배열)
- 신규 API 라우트 추가 없음 — 기존 GET 응답 확장만

---

## 8. File Structure

```
src/
├── instrumentation.ts                 # (v0.4 신규) Next.js 기동 훅 — 3분 setInterval 등록
├── lib/
│   ├── mailer.ts                      # 기존 — 단건 발송 유틸
│   └── mass-mail/
│       ├── collect-recipients.ts      # 신규 — 발송대상 이메일 수집
│       ├── send-processor.ts          # 신규 — 비동기 발송 실행
│       └── auto-retry-batch.ts        # (v0.4 신규) 3분 배치 본체
└── app/api/admin/mass-mails/
    ├── route.ts                       # 기존 — POST 트리거
    └── [id]/
        ├── route.ts                   # 기존 — GET/PUT/DELETE (GET 응답 확장)
        └── retry/route.ts             # 기존 — 수동 재발송 API
```

---

## 9. Implementation Order

**Phase 1 — 기반 (이미 구현 완료, v0.3까지)**

| # | 작업 | 파일 | 의존 |
|---|------|------|------|
| 1 | Prisma 스키마 변경 (테이블+enum+컬럼) | prisma/schema.prisma | - |
| 2 | prisma db push | - | #1 |
| 3 | 이메일 수집 함수 | src/lib/mass-mail/collect-recipients.ts | - |
| 4 | 비동기 발송 함수 | src/lib/mass-mail/send-processor.ts | #1, #3 |
| 5 | POST/PUT 트리거 연결 | mass-mails/route.ts, [id]/route.ts | #4 |
| 6 | 상세 API 응답 확장 (sentTotal/sentSuccess/sentFailed) | mass-mails/[id]/route.ts | #1 |
| 7 | 재발송 API | mass-mails/[id]/retry/route.ts | #4 |
| 8 | openapi.ts 동기화 | src/lib/openapi.ts | #7 |

**Phase 2 — v0.4 추가 (자동 배치 + 失敗確認)**

> 작업번호는 Design v0.3 §7 와 매핑됩니다 (Plan #9 = Design #12, ...).

| Plan # | Design # | 작업 | 파일 | 의존 |
|---|---|------|------|------|
| 9  | 12 | retry_count 컬럼 추가 + prisma db push | prisma/schema.prisma | - |
| -  | 13 | MASS_MAIL_DEFAULTS 에 batch 관련 4개 추가 | src/lib/config.ts | #9 |
| 10 | 14 | sendLoop 30초 룰 + retry_count 증분 로직 | src/lib/mass-mail/send-processor.ts | #9 |
| 11 | 15 | mass_mail.status 자동 전이 헬퍼 (maybePromoteToSent) | src/lib/mass-mail/send-processor.ts | #10 |
| 12 | 16 | 3분 배치 본체 (auto-retry-batch.ts) | src/lib/mass-mail/auto-retry-batch.ts | #10, #11 |
| 13 | 17 | Next.js 기동 훅 (instrumentation.ts) | src/instrumentation.ts | #12 |
| 14 | 18 | GET 응답에 failedRecipients 포함 | mass-mails/[id]/route.ts | #9 |
| 15 | 19 | openapi.ts — failedRecipients 필드 추가 | src/lib/openapi.ts | #14 |
| 16 | 20 | (프론트) [失敗確認] 버튼 + 모달 팝업 | components/admin/bulk-mail/* | **별도 PR** |

---

## 10. 미결 사항 (PO 확인 필요)

| # | 항목 | 상태 |
|---|------|------|
| 1 | QSP 목록 API 확장 (storeLvl, newsRcptYn) | ✅ 추가 확정 (storeLvl: 1/2) — 개발서버 반영 대기 |
| 2 | SUPER_ADMIN/ADMIN 구분 방식 | QSP 응답에 authCd 또는 별도 구분값 포함 여부 확인 필요 |
| 3 | 첨부파일 발송 | 메일에 직접 첨부 vs 다운로드 링크 |
| 4 | 시공점 발송 | AS-IS Seko User List API 스펙 확보 시점 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-16 | Initial draft — 비동기 발송 + 수신자 테이블 | CK |
| 0.2 | 2026-04-16 | 장애 복구 이중 안전망, 発送/再送信 차이, 수집 2단계(목록→상세), email null/중복 제거, 삭제 정책, 중복 트리거 차단 추가 | CK |
| 0.3 | 2026-04-16 | QSP 목록 API에 storeLvl + newsRcptYn 추가 확정 → 수집을 1단계로 단순화 | CK |
| 0.4 | 2026-04-19 | **3분 배치 도입 결정 번복 (v0.3 의 "배치 불필요" → "배치 도입")**. recipient.retry_count 컬럼 추가 (30초 룰 누적, 상한 3). mass_mail.status 자동 전이 (recipients 모두 종결 시 sent). 失敗確認 UI 추가 (기존 GET 응답 확장, 신규 API 없음). Design §9 #4 "자동 복구 검토" 항목 해결. | CK |
