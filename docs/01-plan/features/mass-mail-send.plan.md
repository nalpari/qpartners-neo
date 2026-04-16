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
- **3분 배치/스케줄러 불필요** — 비동기 처리(Fire-and-Forget)로 즉시 시작
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

### 3.1 발송 처리 흐름

```
관리자 [発送] 클릭
    │
    ▼
POST/PUT (status="pending")
    │
    ├─→ ① DB 저장 (status="pending")
    ├─→ ② 프론트에 즉시 응답 반환 { message: "メール送信を受け付けました" }
    └─→ ③ 비동기 처리 시작 (Fire-and-Forget)
         │
         ▼
    ④ QSP userListMng 호출 (userTp별 전체 조회)
       → email 수집 + optOut 필터
         │
         ▼
    ⑤ qp_mass_mail_recipients bulk INSERT
       + massMail.status = "sending"
         │
         ▼
    ⑥ recipients 순차 발송 (sendMail 루프, throttle)
       → 성공: recipient.status = "sent"
       → 실패: recipient.status = "failed" + errorMessage
         │
         ▼
    ⑦ 전원 완료:
       massMail.status = "sent"
       massMail.sentAt = now()
       massMail.sent_total / sent_success / sent_failed 갱신
```

### 3.2 상태 전이

```
draft ──[発送]──→ pending ──[수집시작]──→ sending ──[완료]──→ sent
                                            │
                                            └──[장애 발생]
                                                 │
                                          자동 재시도 (3회, 30초 간격)
                                                 │
                                            ├─ 성공 → 이어서 발송 → sent
                                            │
                                            └─ 3회 실패 → send_failed
                                                          │
                                                   관리자 [再送信] 클릭
                                                          │
                                                   pending 수신자만 이어서 발송
```

### 3.3 장애 복구 (이중 안전망)

**1단계: 자동 재시도**
- 발송 루프 중 전체 장애(SMTP 다운, DB 끊김, 네트워크 단절) 발생 시
- 30초 간격으로 최대 3회 자동 재시도
- 재시도 시 이미 sent 처리된 수신자는 건너뜀 (중복 발송 없음)
- 개별 건 실패(특정 이메일 SMTP 거부 등)는 해당 건만 failed 처리, 나머지 계속 진행

**2단계: 관리자 수동 재발송**
- 자동 재시도 3회 실패 시 massMail.status = "send_failed"
- 관리자 화면에 "送信失敗" 상태 표시 + 발송 현황 (예: 1,500/3,000)
- [再送信] 버튼 클릭 → pending 상태 수신자만 이어서 발송 재개
- 재발송 API: `POST /api/admin/mass-mails/:id/retry`

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

인덱스: `@@index([mass_mail_id, status])`

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

- 응답에 발송 결과 추가:
  ```json
  {
    "data": {
      ...기존 필드,
      "sentTotal": 3000,
      "sentSuccess": 2980,
      "sentFailed": 20
    }
  }
  ```

---

## 8. File Structure

```
src/lib/
├── mailer.ts                          # 기존 — 단건 발송 유틸
└── mass-mail/
    ├── collect-recipients.ts          # 신규 — 발송대상 이메일 수집
    └── send-processor.ts              # 신규 — 비동기 발송 실행
```

---

## 9. Implementation Order

| # | 작업 | 파일 | 의존 |
|---|------|------|------|
| 1 | Prisma 스키마 변경 (테이블+enum+컬럼) | prisma/schema.prisma | - |
| 2 | prisma db push | - | #1 |
| 3 | 이메일 수집 함수 | src/lib/mass-mail/collect-recipients.ts | - |
| 4 | 비동기 발송 함수 | src/lib/mass-mail/send-processor.ts | #1, #3 |
| 5 | POST/PUT 트리거 연결 | mass-mails/route.ts, [id]/route.ts | #4 |
| 6 | 상세 API 응답 확장 | mass-mails/[id]/route.ts | #1 |
| 7 | 재발송 API | mass-mails/[id]/retry/route.ts | #4 |
| 8 | openapi.ts 동기화 | src/lib/openapi.ts | #7 |

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
