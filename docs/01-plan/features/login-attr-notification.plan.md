# 로그인 알림 + 속성정보 변경 알림 Planning Document

> **Summary**: 회원관리 설정(`loginNotiYn` / `attrChgYn`)이 유효(Y)인 회원에게, 로그인 시점·마이페이지 속성정보 변경 시점에 알림 메일 자동 발송
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-27
> **Status**: Draft v0.1
> **화면설계서**: p.47 #6 (로그인 알림받기), p.47 #7 (속성변경 알림받기)
> **연관 plan**: `member-management.plan.md` (FR-10, FR-11)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 회원이 본인 계정에서 발생한 로그인·속성정보 변경 사실을 인지할 수단이 없어, 무단 사용·정보 변경 탐지가 늦어짐 |
| **Solution** | QSP `loginNotiYn` / `attrChgYn` 플래그가 Y 인 회원에게 해당 이벤트 발생 시 알림 메일 자동 발송 |
| **Function/UX Effect** | 로그인 시점·정보 변경 시점에 본인 메일로 알림 도달 → 본인 계정 이상 동작 즉시 인지 |
| **Core Value** | 셀프 보안 모니터링 + 변경 이력 자기 확인 (Bcc 운영 주체 → 운영 측도 이상 패턴 모니터링 가능) |

---

## 1. Overview

### 1.1 Purpose

화면설계서 p.47 #6 #7 에 정의된 알림 설정에 따라:
- **#6 로그인 알림받기**: 유효 회원의 로그인 성공 시점에 알림 메일 발송
- **#7 속성변경 알림받기**: 유효 회원의 마이페이지 정보 변경 완료 시점에 알림 메일 발송

### 1.2 Background

- 회원관리 API(`PUT /api/admin/members/:id`)에서 두 플래그(`loginNotification`, `attributeChangeNotification`) ↔ QSP(`loginNotiYn`, `attrChgYn`) 매핑은 **read/write 완료** (`src/app/api/admin/members/[id]/route.ts:137,508`)
- **메일 발송 자체는 미구현** — `POST /api/auth/login` 본체와 `PUT /api/mypage/profile` 본체에 알림 메일 발송 로직 없음
- 메일러 인프라(`src/lib/mailer.ts`)는 비밀번호 초기화·2FA 등에서 활용 중 (단, 현 시점 `bcc` 옵션 미지원 → 추가 필요)
- AS-IS oldQpartners 분석:
  - **속성 변경 알림**: `mypage/profile/index.php:530-553` 에서 발송 — 양식 미러링 가능
  - **로그인 알림**: AS-IS 코드/메일 상수 모두 **부재** — 신규 기능 (본문 사양 담당자 회신 대기)

### 1.3 유효/무효 판정 기준

| 항목 | 판정 방법 |
|------|----------|
| 로그인 알림 (#6) | 로그인 응답 `qsp.data.loginNotiYn === "Y"` |
| 속성 변경 알림 (#7) | 변경 직전 QSP `userDetail` 의 `attrChgYn === "Y"` |

> **참고**: table-dictionary 에 `qp_info.login_notification` / `attribute_change_notification` 가 정의돼 있으나 **현 Prisma 스키마에 `qp_info` 테이블 자체가 없음**. 본 기능에서는 QSP 의 `loginNotiYn` / `attrChgYn` 를 SOT 로 사용. `qp_info` 도입 시 SOT 전환은 후속 PR 에서 처리.

---

## 2. Scope

### 2.1 In Scope

**공통 인프라**
- [ ] `src/lib/mailer.ts` — `SendMailOptions` 에 `bcc?: string | string[]` 옵션 추가
- [ ] `src/lib/notification-mail/` 신규 모듈 (메일 본문 빌더, 발송 헬퍼, 라벨 매핑)
- [ ] AS-IS `dbword.ini` 매핑을 TO-BE 필드명 기준 매핑 테이블로 옮김 (`field-labels.ts`)

**속성 변경 알림 (FR-11)**
- [ ] `PUT /api/mypage/profile` — QSP 업데이트 성공 후 `attrChgYn === "Y"` 면 변경 항목 diff 메일 발송
- [ ] AS-IS `edit_user.txt` 본문 미러링 (회사정보 / 회원정보 섹션 분리)
- [ ] 변경 항목 diff 계산 로직 (변경 전 QSP 값 vs request 값)

**로그인 알림 (FR-10)** — 본문 사양 회신 후 진행
- [ ] `POST /api/auth/login` — 로그인 성공 후 `loginNotiYn === "Y"` 면 알림 메일 발송
- [ ] 자동로그인(inbound) 발송 정책 결정 (담당자 확인 필요)
- [ ] 2FA 필요 케이스 발송 시점 결정 (1차 로그인 성공 시 vs 2FA 완료 후)

### 2.2 Out of Scope

- 회원관리 UI 의 알림 토글 (이미 `member-management` 에서 처리됨)
- `qp_info` 테이블 신설 및 SOT 전환 (별도 plan 필요)
- 메일 도착 통계/로그 별도 보관 (`qp_interface_log` 의 OUTBOUND 메일 로그로 1차 추적)
- 알림 메일 발송 실패 시 재시도 큐 (1차 발송 실패는 warn 로깅만, 본 응답에는 영향 X)

---

## 3. Requirements

### 3.1 속성 변경 알림 (FR-11, p.47 #7)

| ID | Requirement | Priority | 화면설계서 / AS-IS |
|----|-------------|----------|---------------------|
| FR-A1 | `PUT /api/mypage/profile` 성공 후 변경 알림 발송 | High | p.47 #7 |
| FR-A2 | 발송 조건: 변경 직전 QSP `attrChgYn === "Y"` | High | TO-BE 신규 정책 |
| FR-A3 | 메일 제목: `【Q.PARTNERS】会員情報変更完了のお知らせ` | High | AS-IS const_mail.php:90 |
| FR-A4 | 발신자: `Q.PARTNERS事務局 <q-partners@hqj.co.jp>` | High | AS-IS const_mail.php:8-9 |
| FR-A5 | To: 회원 본인 이메일, Bcc: `hasegawa.j@qcells.com`, `q-partners@hqj.co.jp` | High | AS-IS const_mail.php:93-96 |
| FR-A6 | 본문: AS-IS `edit_user.txt` 양식 그대로 (회사정보 / 회원정보 섹션 분리) | High | AS-IS edit_user.txt |
| FR-A7 | 변경 항목 라벨: AS-IS `dbword.ini` 매핑 (TO-BE 필드명 기준 재매핑) | High | AS-IS dbword.ini |
| FR-A8 | 변경된 항목만 본문에 표시 (변경 안 된 항목 숨김) | High | AS-IS profile/index.php:322-484 |
| FR-A9 | 메일 발송 실패는 본 API 응답에 영향 X (warn 로깅만) | High | TO-BE 정책 |

### 3.2 로그인 알림 (FR-10, p.47 #6) — 본문 사양 회신 후 확정

| ID | Requirement | Priority | 화면설계서 / AS-IS |
|----|-------------|----------|---------------------|
| FR-L1 | `POST /api/auth/login` 성공 후 알림 발송 | High | p.47 #6 |
| FR-L2 | 발송 조건: `qsp.data.loginNotiYn === "Y"` | High | TO-BE 신규 정책 |
| FR-L3 | 메일 제목 / 본문 | **TBD** | AS-IS 부재, 담당자 회신 대기 |
| FR-L4 | 발신자: `Q.PARTNERS事務局 <q-partners@hqj.co.jp>` | High | AS-IS 패턴 미러링 |
| FR-L5 | To: 회원 본인 이메일, Bcc: `hasegawa.j@qcells.com`, `q-partners@hqj.co.jp` | High | AS-IS 패턴 미러링 |
| FR-L6 | 발송 시점: 1차 로그인 성공 vs 2FA 완료 후 | **TBD** | 담당자 확인 필요 |
| FR-L7 | 자동로그인(inbound) 발송 여부 | **TBD** | 담당자 확인 필요 |

### 3.3 공통

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-C1 | `mailer.ts` 에 `bcc` 옵션 추가 (string \| string[]) | High | 현재 미지원 |
| FR-C2 | dev 환경 BCC 차단 (mass-mail-test-redirect 패턴 적용) | High | hasegawa.j@qcells.com 등 운영 주체 메일이 dev 에서 실발송되면 사고 |
| FR-C3 | 발송 결과 로그: `qp_interface_log` OUTBOUND/MAIL 항목으로 기록 | Medium | 기존 인프라 재사용 |
| FR-C4 | dbword 매핑 누락 필드는 필드명 그대로 표시 + warn 로그 | Medium | 누락 필드 추적 |

---

## 4. API Endpoints (변경 사항)

```
PUT /api/mypage/profile         → 본체 수정: QSP 성공 후 attrChgYn 분기 + 메일 발송 추가
POST /api/auth/login            → 본체 수정: 로그인 성공 후 loginNotiYn 분기 + 메일 발송 추가 (FR-L 확정 후)
POST /api/auth/two-factor/verify → 발송 시점이 2FA 완료 후로 결정될 경우 추가 (FR-L6 확정 후)
POST /api/auth/auto-login/inbound → 자동로그인 발송 정책 따라 추가 검토 (FR-L7 확정 후)
```

신규 엔드포인트는 없음 — 기존 endpoint 본체에 알림 발송 로직만 추가.

---

## 5. 신규 모듈 구조

```
src/lib/notification-mail/
├── field-labels.ts          // dbword.ini → TO-BE 필드명 기준 매핑 테이블
├── attr-change-mail.ts      // 속성 변경 메일 본문 빌더 + 발송 헬퍼
├── login-mail.ts            // 로그인 알림 메일 본문 빌더 + 발송 헬퍼 (FR-L 확정 후)
├── send-notification.ts     // 공통 발송 헬퍼 (Bcc 가드 + 로깅 + 실패 처리)
└── constants.ts             // 메일 제목, From, Bcc 상수
```

`src/lib/mailer.ts` 변경:
```ts
interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  bcc?: string | string[];   // 신규
  attachments?: SendMailAttachment[];
}
```

---

## 6. 변경 항목 라벨 매핑 (FR-A7)

AS-IS `dbword.ini` 매핑을 TO-BE `profileUpdateSchema` 필드명 기준으로 재매핑:

| TO-BE 필드 | AS-IS dbword | 일본어 라벨 |
|-----------|--------------|-------------|
| `sei` | sei | `氏名(姓)` |
| `mei` | mei | `氏名(名)` |
| `seiKana` | sei_kana | `フリガナ(姓)` |
| `meiKana` | mei_kana | `フリガナ(名)` |
| `compNm` | user_name | `会社名` |
| `compNmKana` | user_name_kana | `会社名フリガナ` |
| `zipcode` | user_zipcode | `郵便番号` |
| `address1` | user_address1 | `市区町村` |
| `address2` | user_address2 | `以降の住所` |
| `telNo` | user_tel | `電話番号` |
| `fax` | user_fax | `FAX番号` |
| `department` | (대응 없음) | `部署` (신규) |
| `jobTitle` | (대응 없음) | `役職` (신규) |
| `corporateNo` | (대응 없음) | `法人番号` (신규) |
| `newsRcptYn` | (대응 없음) | `ニュースレター受信` (신규) |

> AS-IS 본문 구조 (`edit_user.txt`):
> - `●会社情報変更` 섹션: compNm, compNmKana 등 회사 관련
> - `●会員情報変更` 섹션: sei, mei, seiKana, meiKana, zipcode, address*, telNo, fax 등 개인 관련
> - 변경된 항목만 `라벨 : 값` 형식으로 1줄씩

---

## 7. Process Flow

### 7.1 속성 변경 알림 (구현 가능)

```
[마이페이지 정보 변경 제출] ─── PUT /api/mypage/profile
    │
    ▼
[변경 직전 QSP userDetail 조회]   ← 변경 전 값 + attrChgYn 확보
    │
    ▼
[QSP updateUserDtl 호출]
    │
    ├── 실패 → 에러 응답 (메일 발송 X)
    │
    └── 성공 → [attrChgYn === "Y" 분기]
                  │
                  ├── N/null → 메일 발송 X
                  │
                  └── Y → [diff 계산: 변경 전 QSP 값 vs request 값]
                            │
                            ▼
                        [본문 빌드: dbword 라벨 + 변경 항목]
                            │
                            ▼
                        [sendMail(to=본인, bcc=운영 주체)]
                            │
                            ├── 성공 → 본 API 응답에 영향 X
                            └── 실패 → warn 로깅만, 본 API 는 200 정상 응답
```

### 7.2 로그인 알림 (본문 사양 회신 후 확정)

```
[로그인 요청] ─── POST /api/auth/login
    │
    ▼
[QSP login 호출 → 성공]
    │
    ├── loginNotiYn !== "Y" → 메일 발송 X
    │
    └── loginNotiYn === "Y" →
          [발송 시점 정책 분기 (FR-L6)]
            │
            ├── (A) 1차 로그인 성공 시 → 즉시 메일 발송
            │       (2FA 필요해도 발송 — "로그인 시도가 있었다" 알림)
            │
            └── (B) 2FA 완료 후 발송 → POST /api/auth/two-factor/verify 성공 시 발송
                    (실제 사용자 진입 확정 후 알림)

[자동로그인 inbound (FR-L7)]
    └── 정책에 따라 발송/생략 결정
```

---

## 8. Dependencies / 확인 필요 사항

| 항목 | 상태 | Notes |
|------|------|-------|
| QSP `loginNotiYn` / `attrChgYn` 응답 포함 | ✅ 확인 완료 | login 응답 / userDetail 응답에 포함 |
| 메일러 인프라 (`mailer.ts`) | ⚠️ Bcc 옵션 추가 필요 | `SendMailOptions` 확장 |
| AS-IS `edit_user.txt` 본문 | ✅ 확보 | `oldQpartners/sitemanage/templates/_mail/edit_user.txt` |
| AS-IS `dbword.ini` 매핑 | ✅ 확보 | `oldQpartners/sitemanage/ini/dbword.ini` |
| 로그인 알림 본문 사양 | ⏳ **담당자 회신 대기** | AS-IS 부재 → 신규 작성 필요 |
| 로그인 알림 발송 시점 (1차 vs 2FA 완료) | ⏳ **담당자 확인 필요** | UX 결정 필요 |
| 자동로그인 inbound 발송 여부 | ⏳ **담당자 확인 필요** | inbound 는 외부 시스템 통한 로그인 |
| dev 환경 BCC 차단 패턴 | ✅ 참고 가능 | `mass-mail-test-redirect` 동일 패턴 적용 |

---

## 9. 구현 우선순위

| 순서 | 작업 | 상태 |
|------|------|------|
| 1 | `mailer.ts` 에 Bcc 옵션 추가 + `notification-mail/` 모듈 골격 + dev BCC 가드 | API 담당 |
| 2 | `field-labels.ts` 작성 (dbword 매핑) | API 담당 |
| 3 | `attr-change-mail.ts` 빌더 + `PUT /api/mypage/profile` 통합 | API 담당 |
| 4 | 속성 변경 알림 E2E 검증 (ethereal) | API 담당 |
| 5 | (FR-L 확정 후) `login-mail.ts` 빌더 + login route 통합 | API 담당 |
| 6 | 로그인 알림 E2E 검증 | API 담당 |

---

## 10. 보안·운영 고려사항

- **PII 로깅 금지**: 메일 본문/주소는 로그에 평문 노출 금지. `console.log` 시 `maskEmail()` 사용.
- **운영 주체 메일 보호**: dev 환경에서 `hasegawa.j@qcells.com` 등 실주소로 발송 차단 (mass-mail-test-redirect 패턴).
- **fail-safe**: 알림 메일 발송 실패가 본체 API(login / profile update) 응답을 깨면 안 됨. try-catch 로 격리 + warn 로깅.
- **rate**: 로그인 알림은 회원이 직접 트리거하는 이벤트이므로 별도 rate limit 불필요. 단, 외부 공격으로 유효 회원 ID 에 무효 비밀번호 연속 시도 시 메일 폭탄 가능성 → 로그인 **성공** 시점에만 발송하므로 문제 없음.
- **변경 항목 누출 방지**: 본문에 변경 후 값을 그대로 표시하므로 메일 도청 시 정보 노출. 비밀번호 등 민감 필드는 본 schema 범위 밖이지만, 향후 확장 시 마스킹 정책 사전 정의 필요.

---

## 11. 프론트 전달 사항

API 변경 없음(엔드포인트 신설 X, 응답 포맷 변경 X). 프론트 추가 작업 불필요.

> 단, 회원관리 UI 의 알림 토글이 ON/OFF 됐을 때 사용자에게 "다음 로그인부터 적용됩니다" 안내 표기 권장.

---

## 12. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|-----------|
| Q1 | 로그인 알림 본문 사양 (제목, 본문, 노출 정보) | 담당자 | ⏳ 회신 대기 |
| Q2 | 로그인 알림 발송 시점: 1차 로그인 성공 vs 2FA 완료 후 | 담당자 | ⏳ 회신 대기 |
| Q3 | 자동로그인(inbound) 시 알림 발송 여부 | 담당자 | ⏳ 회신 대기 |
| Q4 | 메일 본문 포맷: HTML vs Plain text (AS-IS 는 Plain) | 담당자 | TO-BE mailer는 HTML 필수 → HTML 본문 + `<pre>` 또는 escape 후 `<br>` 변환 검토 |
| Q5 | `qp_info` 테이블 도입 시점 (SOT 전환 계획) | 별도 plan | 본 PDCA 범위 외 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-27 | Initial draft (AS-IS 분석 + TO-BE 통합 계획 + Open Questions) | CK |
