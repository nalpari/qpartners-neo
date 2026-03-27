# 비밀번호 초기화 Planning Document

> **Summary**: 비밀번호 초기화 요청 → 이메일 변경 링크 발송 → 신규 비밀번호 설정 + 2차 인증
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-26
> **Status**: Draft
> **화면설계서**: p.11 (초기화 팝업), p.12 (변경 링크 메일), p.13 (회원정보 설정 팝업), p.14 (2차 인증 팝업), p.15 (2차 인증 메일)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 사용자가 비밀번호를 분실하거나 초기화가 필요한 경우 대응 수단이 없음 |
| **Solution** | 이메일 기반 비밀번호 재설정 링크 발송 + 신규 비밀번호 설정 + 2차 인증 |
| **Function/UX Effect** | 비밀번호 초기화 팝업 → 메일 발송 → 링크 접속 → 비밀번호 변경 → 자동 로그인 |
| **Core Value** | 셀프서비스 비밀번호 관리, 보안 강화 (2차 인증) |

---

## 1. Overview

### 1.1 Purpose
사용자가 비밀번호를 분실했을 때 이메일을 통해 비밀번호를 재설정할 수 있는 기능 제공.
재설정 후 로그인 시 2차 인증을 통해 보안을 강화한다.

### 1.2 Background
- Prisma 스키마에 `PasswordResetToken`, `TwoFactorCode` 모델 이미 준비됨
- 사용자 정보는 QSP 측 관리 (TO-BE DB에 없음)
- 이메일 발송 기능 필요 (SMTP 또는 외부 메일 서비스)
- 비밀번호 변경은 QSP 측 API 연동 여부 확인 필요

### 1.3 회원정보 설정 팝업 호출 조건
1. 비밀번호 재설정 링크로 접속한 경우
2. 판매점 회원이 Q.ORDER/MUSUBI에 한번도 로그인하지 않고 Q.PARTNERS에 최초 로그인한 경우

---

## 2. Scope

### 2.1 In Scope
- [ ] 비밀번호 초기화 요청 API (이메일 입력 → 토큰 생성 → 메일 발송)
- [ ] 비밀번호 변경 API (토큰 검증 → 신규 비밀번호 저장)
- [ ] 이메일 발송 (비밀번호 변경 링크)
- [ ] 이메일 중복 체크 API
- [ ] 2차 인증 코드 발송 API (로그인 후 인증번호 메일 발송)
- [ ] 2차 인증 코드 검증 API
- [ ] 2차 인증 코드 재전송 API

### 2.2 Out of Scope
- 비밀번호 초기화 팝업 UI (프론트 담당)
- 회원정보 설정 팝업 UI (프론트 담당)
- 2차 인증 팝업 UI (프론트 담당)
- 메일 템플릿 디자인 (퍼블 담당)

---

## 3. Requirements

### 3.1 비밀번호 초기화 (p.11)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 회원유형 표시 (읽기전용, 로그인 탭에서 선택한 값) | High | p.11 #1 |
| FR-02 | 이메일 주소 입력 | High | p.11 #2 |
| FR-03 | 입력 이메일이 DB에 존재하는지 확인 | High | p.11 |
| FR-04 | 성공 시 비밀번호 변경 링크 이메일 발송 | High | p.11 #4 |
| FR-05 | 성공 Alert: "비밀번호 변경 링크가 이메일로 발송되었습니다." | Medium | p.11 |
| FR-06 | 실패 Alert: "일치하는 회원 정보가 없습니다. 입력하신 정보를 다시 확인해 주세요." | Medium | p.11 |

### 3.2 비밀번호 변경 링크 메일 (p.12)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-07 | 발신자: Q.PARTNERS事務局 <q-partners@hqj.co.jp> | High | p.12 |
| FR-08 | 수신자: 초기화 요청 시 입력한 이메일 | High | p.12 |
| FR-09 | 비밀번호 변경 링크 포함 (일정 시간 후 만료) | High | p.12 |
| FR-10 | 일본어/한국어 메일 본문 | Medium | p.12 |

### 3.3 회원정보 설정 팝업 (p.13)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-11 | 이메일 있는 경우: Read only 표시 | High | p.13 #1 |
| FR-12 | 이메일 없는 경우: 입력창 + 중복체크 버튼 활성화 | High | p.13 #1-1 |
| FR-13 | 이메일 중복체크 (OK/FAIL) | High | p.13 |
| FR-14 | 신규 비밀번호 입력 (마스킹) | High | p.13 #2 |
| FR-15 | 신규 비밀번호 재입력 (마스킹) | High | p.13 #3 |
| FR-16 | 비밀번호 정책: 영문대문자 + 영문소문자 + 숫자 조합, 8자 이상 | High | p.13 |
| FR-17 | 저장 시 이메일 중복체크 완료 + 비밀번호 일치 확인 후 버튼 활성화 | High | p.13 #5 |
| FR-18 | 저장 성공 시 Alert "저장되었습니다." + 자동 로그인 | High | p.13 #5 |
| FR-19 | 취소 시 로그인 화면으로 이동 | Medium | p.13 #4 |

### 3.4 2차 인증 (p.14-15)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-20 | 로그인 성공 후 2단계 인증 메일 발송 (6자리 인증번호) | High | p.14 |
| FR-21 | 인증번호 입력 (숫자만, 10분 제한) | High | p.14 #1 |
| FR-22 | 인증 성공 시 홈화면 블러 해제 (성공 메시지 없음) | High | p.14 #3 |
| FR-23 | 인증 실패 시 오류 메시지 표시 | High | p.14 #3-1 |
| FR-24 | 재전송 버튼 (신규 인증번호 발송) | High | p.14 #4 |
| FR-25 | 취소 시 로그인 화면으로 이동 | Medium | p.14 #2 |
| FR-26 | 비밀번호 초기화 후 로그인 시 2차 인증 불필요 | High | p.14 |
| FR-27 | 2차 인증 대상: 회원 관리 DATA 중 2단계 인증 해제 미체크 회원 | High | p.14 |

---

## 4. API Endpoints

```
# 비밀번호 초기화
POST   /api/auth/password-reset/request   → 초기화 요청 (이메일 확인 + 토큰 생성 + 메일 발송)
POST   /api/auth/password-reset/verify     → 토큰 검증 (링크 유효성 확인)
POST   /api/auth/password-reset/confirm    → 비밀번호 변경 (토큰 + 신규 비밀번호)

# 이메일
POST   /api/auth/email/check              → 이메일 중복 체크

# 2차 인증
POST   /api/auth/two-factor/send          → 인증번호 발송
POST   /api/auth/two-factor/verify        → 인증번호 검증
POST   /api/auth/two-factor/resend        → 인증번호 재전송
```

---

## 5. Data Model (기존 Prisma)

```
PasswordResetToken (qp_password_reset_tokens)
├── id: Int (PK, auto)
├── userType: UserType (ADMIN/DEALER/SEKO/GENERAL)
├── userId: String (255)
├── token: String (unique, 255)
├── expiresAt: DateTime
├── used: Boolean (default: false)
└── createdAt: DateTime

TwoFactorCode (qp_two_factor_codes)
├── id: Int (PK, auto)
├── userType: UserType
├── userId: String (255)
├── code: String (6자리)
├── expiresAt: DateTime
├── verified: Boolean (default: false)
└── createdAt: DateTime
```

---

## 6. Dependencies / 확인 필요 사항

| 항목 | 상태 | Notes |
|------|------|-------|
| QSP 비밀번호 변경 API | **I/F 요청중** | QSP 측 비밀번호 변경 API (담당자 진행중) |
| QSP 이메일 존재 확인 API | **I/F 요청중** | QSP(판매점/일반) 이메일 존재 유무 확인 |
| as-is 이메일 존재 확인 API | **I/F 요청중** | as-is(시공점) 이메일 존재 유무 확인 |
| 메일 발송 서비스 | ✅ 확보 | SMTP: smtp.alpha-prm.jp:587, 발신자: q-partners@hqj.co.jp |
| 비밀번호 정책 검증 | 구현 필요 | 영문대문자 + 영문소문자 + 숫자 조합, 8자 이상 |

---

## 7. Process Flow

```
[비밀번호 초기화 요청]
    │  회원유형 + 이메일 입력
    ▼
[이메일 DB 확인]
    ├── 불일치 → Alert "일치하는 회원 정보가 없습니다"
    │
    └── 일치 → PasswordResetToken 생성 (만료시간 포함)
                  │
                  ▼
              [변경 링크 메일 발송]
                  │
                  ▼
              [링크 클릭 → 회원정보 설정 팝업]
                  │  이메일 표시/입력 + 신규 비밀번호 설정
                  ▼
              [비밀번호 변경 + 자동 로그인]
                  │
                  ▼
              [2차 인증 필요 여부 판단]
                  ├── 비밀번호 초기화 후 → 2차 인증 Skip
                  └── 일반 로그인 → 2차 인증 메일 발송
                                      │
                                      ▼
                                  [인증번호 입력 (10분)]
                                      ├── 성공 → 홈화면
                                      └── 실패/만료 → 오류 메시지
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-26 | Initial draft (화면설계서 p.11-15 기반) | CK |
