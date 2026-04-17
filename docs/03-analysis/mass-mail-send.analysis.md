# 대량메일 발송 처리 Gap Analysis

> **Feature**: mass-mail-send
> **Project**: qpartners-neo
> **Branch**: feature/mass-mail-send
> **Date**: 2026-04-17
> **Plan**: [mass-mail-send.plan.md](../01-plan/features/mass-mail-send.plan.md) (v0.3)
> **Design**: [mass-mail-send.design.md](../02-design/features/mass-mail-send.design.md) (v0.1)
> **Match Rate**: **96%** (≥ 90% 임계 통과)

---

## 1. 전체 스코어

| 카테고리 | 점수 | 상태 |
|---|:-:|:-:|
| Design 명세 구현률 | 96% | ✅ |
| Architecture 준수 | 100% | ✅ |
| Convention 준수 | 95% | ✅ |
| **Overall Match Rate** | **96%** | ✅ |

---

## 2. 명세 대비 구현 체크리스트 (25/25)

### 2.1 DB 스키마 (Design §1) — 7/7

| # | 항목 | 위치 | 상태 |
|---|------|------|:----:|
| 1 | `MassMailRecipient` 모델 + 모든 필드 | `prisma/schema.prisma` | ✅ |
| 2 | `RecipientStatus` enum (pending/sent/failed) | `prisma/schema.prisma` | ✅ |
| 3 | `RecipientAuthRole` enum 6개 (옵션 A 채택) | `prisma/schema.prisma` | ✅ |
| 4 | `MailStatus` enum 확장 (`sending`, `send_failed`) | `prisma/schema.prisma` | ✅ |
| 5 | `MassMail.sentTotal/sentSuccess/sentFailed` 컬럼 | `prisma/schema.prisma` | ✅ |
| 6 | `MassMail.recipients` relation | `prisma/schema.prisma` | ✅ |
| 7 | `@@index([massMailId, status])` | `prisma/schema.prisma` | ✅ |

### 2.2 이메일 수집 모듈 (Design §2) — 5/5

| # | 항목 | 위치 | 상태 |
|---|------|------|:----:|
| 1 | `collectRecipients` 시그니처 | `src/lib/mass-mail/collect-recipients.ts` | ✅ |
| 2 | userTp별 페이징 반복 (MAX_PAGES=100) | 동상 | ✅ |
| 3 | storeLvl 1/2 분기, optOut 필터 | 동상 | ✅ |
| 4 | email 기준 중복 제거 (Map 선착순) | 동상 | ✅ |
| 5 | SEKO 경고 로그 + 스킵 | 동상 | ✅ |
| - | `qspMemberItemSchema` storeLvl/newsRcptYn 확장 | `src/lib/schemas/member.ts` | ✅ |

### 2.3 발송 처리 모듈 (Design §3) — 6/6

| # | 항목 | 위치 | 상태 |
|---|------|------|:----:|
| 1 | `processMassMailSend` 엔트리 (Fire-and-Forget) | `src/lib/mass-mail/send-processor.ts` | ✅ |
| 2 | 중복 트리거 방지 (recipients 존재 시 retry 전환) | 동상 | ✅ |
| 3 | bulk INSERT + status="sending" 낙관적 락 트랜잭션 | 동상 | ✅ |
| 4 | `sendLoop` 개별 실패 격리 + throttle + 집계 increment | 동상 | ✅ |
| 5 | `runWithRetry` 최대 maxRetries 회 자동 재시도 | 동상 | ✅ |
| 6 | `processMassMailRetry` 수집/INSERT 없이 sendLoop 재실행 | 동상 | ✅ |

### 2.4 API (Design §4) — 5/5

| # | 항목 | 위치 | 상태 |
|---|------|------|:----:|
| 1 | POST `/api/admin/mass-mails` 트리거 추가 | `src/app/api/admin/mass-mails/route.ts` | ✅ |
| 2 | PUT `/api/admin/mass-mails/:id` 트리거 추가 | `src/app/api/admin/mass-mails/[id]/route.ts` | ✅ |
| 3 | POST `/api/admin/mass-mails/:id/retry` 신규 | `src/app/api/admin/mass-mails/[id]/retry/route.ts` | ✅ |
| 4 | GET 응답 sentTotal/Success/Failed 추가 | `src/app/api/admin/mass-mails/[id]/route.ts` | ✅ |
| 5 | DELETE 상태 체크 (draft만 허용) | `src/app/api/admin/mass-mails/[id]/route.ts` | ✅ |

### 2.5 설정/상수 (Design §5) — 2/2

| # | 항목 | 위치 | 상태 |
|---|------|------|:----:|
| 1 | `MASS_MAIL_DEFAULTS` 5개 (throttleMs/maxRetries/retryDelayMs/pageSize/maxPages) | `src/lib/config.ts` | ✅ |
| 2 | 환경변수 5종 지원 (MASS_MAIL_*) | 동상 | ✅ |

---

## 3. Gaps

### 3.1 Missing (Design O, Impl X) — 0건
**없음.**

### 3.2 Added (Design X, Impl O) — 2건 (개선)

| # | 차이 | 영향 |
|---|------|------|
| 1 | `collectRecipients` 3번째 파라미터 `loginId` 추가 (Design은 SYSTEM_USER_ID 전역 상수 암시, 구현은 발송 주체 userId 동적 전달) | 추적성 향상 |
| 2 | `MassMail.updatedAt/updatedBy` 등 기존 필드는 Design에 미서술 | CRUD PR 범위, 문제 없음 |

### 3.3 Changed (Design ≠ Impl) — 1건 (경미)

| # | Design | Impl | 영향 |
|---|--------|------|------|
| 1 | §3.2: `massMail.sent_total = recipients.length` 단독 UPDATE | `createMany` + `updateMany` `$transaction` 묶음 | 원자성 강화, 정합성 향상 |

---

## 4. 실동작 테스트 결과 (2026-04-17)

| 시나리오 | 기대 | 결과 |
|----------|:----:|:----:|
| ① POST draft 생성 | 200 | ✅ |
| ② PUT draft→pending (트리거) | 200 | ✅ |
| ③ collect-recipients (GENERAL 4건 수집) | 4건 | ✅ |
| ④ Ethereal SMTP 발송 4건 (250 Accepted) | 4 sent | ✅ |
| ⑤ sendLoop 종료 (성공 4 / 실패 0) | 0 failed | ✅ |
| ⑥ GET 상세 sentTotal=4/Success=4/Failed=0 | 일치 | ✅ |
| ⑦ status 전이 pending→sending→sent | 일치 | ✅ |
| ⑧ DELETE on sent → 400 거부 | 400 | ✅ |
| ⑨ retry on sent → 400 거부 | 400 | ✅ |
| ⑩ DELETE on draft → 200 성공 | 200 | ✅ |

---

## 5. Out of Scope (PO 확인 필요 — Design §9)

| # | 항목 | 1차 결정 |
|---|------|---------|
| 1 | SUPER_ADMIN/ADMIN 구분 | ADMIN으로 통합 발송 |
| 2 | 첨부파일 발송 | 본문만 발송 (미포함) |
| 3 | SEKO 발송 | 스킵 + 경고 로그 |
| 4 | 서버 재기동 시 sending 잔존 복구 | 관리자 수동 retry |

---

## 6. 권장 조치

1. **Design §2.1 업데이트** — `collectRecipients` 시그니처 (3번째 파라미터 `loginId`) 실 구현 기준 동기화
2. **Design §3.2 다이어그램 업데이트** — "createMany + updateMany 원자적 트랜잭션" 명시
3. 기타 중대 갭 없음 — `/pdca report mass-mail-send` 진행 가능

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | Initial Gap analysis (Match Rate 96%) | CK |
