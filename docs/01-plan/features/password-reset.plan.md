# 비밀번호 초기화 + 회원정보 설정 팝업 Planning Document

> **Summary**: 비밀번호 초기화 + 회원정보 설정 팝업 (토큰 기반 / 세션 기반) + 2차 인증
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-26
> **Status**: Draft → v0.3 Updated
> **화면설계서 v1.1**: p.11 (초기화 팝업), p.12 (회원정보 설정 팝업), p.13 (변경 링크 메일), p.14 (2차 인증 팝업), p.15 (2차 인증 메일)

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

### 1.3 회원정보 설정 팝업 호출 조건 (p.12)

| 케이스 | 트리거 | 인증 수단 | 사용 API |
|--------|--------|-----------|----------|
| (1) 비밀번호 재설정 링크 접속 | URL 토큰 검증 성공 | PasswordResetToken | `POST /api/auth/password-reset/confirm` (기존) |
| (2) 판매점 최초 로그인 | 로그인 응답 `pwdInitYn=Y` | JWT 세션 | `POST /api/auth/password-init` (**신규**) |

- 프론트에서는 **같은 팝업 UI**를 사용하되, 호출 경로에 따라 API 엔드포인트만 분기
- 케이스 (2)는 토큰 불필요 — 이미 로그인 성공 상태(JWT 발급됨)이므로 세션이 인증 수단

---

## 2. Scope

### 2.1 In Scope

**비밀번호 초기화 (토큰 기반)**
- [x] 비밀번호 초기화 요청 API (이메일 입력 → 토큰 생성 → 메일 발송)
- [x] 비밀번호 변경 API — 토큰 기반 (토큰 검증 → 신규 비밀번호 저장 → 자동 로그인)
- [x] 토큰 검증 API (링크 유효성 확인)
- [x] 이메일 발송 (비밀번호 변경 링크)
- [x] 이메일 중복 체크 API

**회원정보 설정 — 판매점 최초 로그인 (세션 기반, 신규)**
- [ ] 로그인 응답에 `pwdInitYn` 필드 추가 (프론트 팝업 트리거용)
- [ ] 비밀번호 변경 API — 세션 기반 (JWT 인증 → 신규 비밀번호 저장 → JWT 재발급)
- ~~이메일 미등록 시 이메일 설정~~ → 이메일 필수이므로 해당 없음

**2차 인증**
- [x] 2차 인증 코드 발송 API (로그인 후 인증번호 메일 발송)
- [x] 2차 인증 코드 검증 API
- [ ] 2차 인증 코드 재전송 API (send와 통합 가능)

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

### 3.3 회원정보 설정 팝업 (p.12) — 공통 UI, API만 분기

| ID | Requirement | Priority | 화면설계서 | API 담당 영역 |
|----|-------------|----------|-----------|--------------|
| FR-11 | 이메일 있는 경우: Read only 표시 | High | p.12 #1 | 프론트 (로그인 응답 email 필드로 판별) |
| FR-12 | 이메일 없는 경우: 입력창 + 중복체크 버튼 활성화 | High | p.12 #1-1 | 프론트 + 기존 email/check API |
| FR-13 | 이메일 중복체크 (OK/FAIL) | High | p.12 | ✅ 구현 완료 (`POST /api/auth/email/check`) |
| FR-14 | 신규 비밀번호 입력 (마스킹) | High | p.12 #2 | 프론트 |
| FR-15 | 신규 비밀번호 재입력 (마스킹) | High | p.12 #3 | 프론트 |
| FR-16 | 비밀번호 정책: 영문대문자 + 영문소문자 + 숫자 조합, 8자 이상 | High | p.12 | API: Zod 검증, 프론트: 실시간 검증 |
| FR-17 | 저장 시 이메일 중복체크 완료 + 비밀번호 일치 확인 후 버튼 활성화 | High | p.12 #5 | 프론트 |
| FR-18 | 저장 성공 시 Alert "저장されました。" + 자동 로그인 | High | p.12 #5 | API: 자동 로그인(JWT 발급/재발급) |
| FR-19 | 취소 시 로그인 화면으로 이동 | Medium | p.12 #4 | 프론트 |

#### 3.3.1 케이스별 API 분기 (API 담당 핵심)

| ID | Requirement | Priority | 케이스 |
|----|-------------|----------|--------|
| FR-30 | 케이스(1) 토큰 기반: `password-reset/confirm` 호출 (기존) | High | 비밀번호 재설정 링크 |
| FR-31 | 케이스(2) 세션 기반: `password-init` 호출 (신규) | High | 판매점 최초 로그인 |
| FR-32 | 로그인 응답에 `pwdInitYn` 필드 추가 (프론트 트리거용) | High | 판매점 최초 로그인 |
| ~~FR-33~~ | ~~이메일 미등록 시 저장~~ → 이메일 필수이므로 해당 없음 | - | - |
| FR-34 | 케이스(2) 저장 성공 → JWT 재발급 (pwdInitYn 해소) | High | 판매점 최초 로그인 |

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
# 비밀번호 초기화 (토큰 기반) — 전부 구현 완료
POST   /api/auth/password-reset/request   → ✅ 초기화 요청 (이메일 확인 + 토큰 생성 + 메일 발송)
POST   /api/auth/password-reset/verify    → ✅ 토큰 검증 (링크 유효성 확인)
POST   /api/auth/password-reset/confirm   → ✅ 비밀번호 변경 (토큰 + 신규 비밀번호 + 자동 로그인)

# 회원정보 설정 — 판매점 최초 로그인 (세션 기반) — 신규 구현 필요
POST   /api/auth/password-init          → ❌ 비밀번호 변경 + 이메일 설정 (JWT 인증)

# 로그인 (기존 수정 필요)
POST   /api/auth/login                    → ⚠️ 응답에 pwdInitYn 추가 필요

# 이메일
POST   /api/auth/email/check              → ✅ 이메일 중복 체크

# 2차 인증
POST   /api/auth/two-factor/send          → ✅ 인증번호 발송
POST   /api/auth/two-factor/verify        → ✅ 인증번호 검증
POST   /api/auth/two-factor/resend        → (send와 동일 엔드포인트로 통합 가능)
```

### 4.1 신규 API: POST /api/auth/password-init (세션 기반)

```
인증: httpOnly 쿠키 JWT (로그인 상태 필수)
Request Body:
{
  "newPassword": "string (필수, 비밀번호 정책 준수)"
}

※ 이메일은 전 회원유형 필수 — 미등록 케이스 없음. 팝업에서는 Read only 표시.

처리 흐름:
1. JWT 쿠키에서 userId, userTp, email 추출
2. QSP passwordChange 호출 (chgType="I", loginId=userId)
3. 성공 → JWT 재발급 (twoFactorVerified=true)
4. 응답: { data: { message: "保存されました。", user } }

에러 처리:
- JWT 없음/만료 → 401
- 비밀번호 정책 미충족 → 400
- QSP 호출 실패 → 502
```

### 4.2 기존 수정: POST /api/auth/login 응답 변경

```
현재 응답: { data: { userId, userNm, ..., requireTwoFactor } }
변경 후:   { data: { userId, userNm, ..., requireTwoFactor, pwdInitYn } }

- LoginUser 타입에 pwdInitYn 필드 추가 (QSP 응답에서 이미 수신 중)
- 프론트에서 pwdInitYn === "Y" 감지 → 회원정보 설정 팝업 표시
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
| QSP 비밀번호 변경 API | ✅ 연동 완료 | `password-reset/confirm`에서 chgType="I"로 사용 중 |
| QSP 이메일 존재 확인 API | ✅ 연동 완료 | `email/check`에서 userDetail API 활용 |
| as-is 이메일 존재 확인 API | **I/F 요청중** | as-is(시공점) 이메일 존재 유무 확인 |
| 메일 발송 서비스 | ✅ 확보 | SMTP: smtp.alpha-prm.jp:587, 발신자: q-partners@hqj.co.jp |
| 비밀번호 정책 검증 | ✅ 구현 완료 | Zod 스키마에서 검증 (password-reset/confirm) |
| ~~QSP 이메일 업데이트 API~~ | ✅ 불필요 | 이메일은 필수 — 미등록 케이스 없음 |

### 6.1 R-4 해결: 판매점 최초 로그인 시 토큰 확보 방법

> ~~확인 필요: password-reset/confirm은 토큰 기반인데 판매점 최초 로그인 시 토큰이 없다~~

**해결**: 판매점 최초 로그인은 `password-reset/confirm`을 사용하지 않음.
- 로그인 성공 시 이미 JWT가 발급된 상태이므로, **세션(JWT) 기반**의 별도 API 사용
- 신규 엔드포인트: `POST /api/auth/password-init` (4.1절 참조)
- 토큰 테이블 조회 불필요 — JWT 쿠키가 인증 수단

---

## 7. Process Flow

### 7.1 케이스(1): 비밀번호 재설정 링크 (토큰 기반) — 구현 완료

```
[비밀번호 초기화 요청]
    │  회원유형 + 이메일 입력
    ▼
[이메일 DB 확인] ─── POST /api/auth/password-reset/request
    ├── 불일치 → Alert "일치하는 회원 정보が見つかりません"
    │
    └── 일치 → PasswordResetToken 생성 + 변경 링크 메일 발송
                  │
                  ▼
              [링크 클릭 → 토큰 검증] ─── POST /api/auth/password-reset/verify
                  │
                  ▼
              [회원정보 설정 팝업]
                  │  이메일 표시(Read only) + 신규 비밀번호 설정
                  ▼
              [비밀번호 변경 + 자동 로그인] ─── POST /api/auth/password-reset/confirm
                  │  (2차 인증 Skip — p.14 스펙)
                  ▼
              [홈화면]
```

### 7.2 케이스(2): 판매점 최초 로그인 (세션 기반) — 신규 구현 필요

```
[판매점 로그인] ─── POST /api/auth/login
    │  응답: { ..., pwdInitYn: "Y" }
    ▼
[프론트: pwdInitYn === "Y" 감지 → 회원정보 설정 팝업 강제 표시]
    │
    ├── 이메일 없으면 → 이메일 입력 + 중복체크 ─── POST /api/auth/email/check (기존)
    │
    │  신규 비밀번호 + 재입력
    ▼
[비밀번호 변경 + 이메일 설정 + JWT 재발급] ─── POST /api/auth/password-init (신규)
    │  (2차 인증 Skip — pwdInitYn 케이스)
    ▼
[홈화면]
```

### 7.3 2차 인증 (양쪽 케이스 공통으로 Skip 조건 적용)

```
[일반 로그인 (pwdInitYn !== "Y" && 2FA 필요)]
    ▼
[2차 인증 메일 발송] ─── POST /api/auth/two-factor/send
    │
    ▼
[인증번호 입력 (10분)]
    ├── 성공 → 홈화면 ─── POST /api/auth/two-factor/verify
    └── 실패/만료 → 오류 메시지
```

---

## 8. 구현 우선순위 (API 담당)

| 순서 | 작업 | 난이도 | 비고 |
|------|------|--------|------|
| 1 | 로그인 응답에 `pwdInitYn` 추가 | 낮음 | LoginUser 타입 수정 + 응답 포함 |
| 2 | `POST /api/auth/password-init` 구현 | 중간 | 기존 password-reset/confirm 참고하여 세션 기반으로 |
| 3 | QSP 이메일 업데이트 방법 확인 | — | QSP 측 확인 필요 (이메일 미등록 유저) |

---

## 9. 프론트 전달 사항

1. 로그인 응답에 `pwdInitYn: "Y"/"N"` 필드 추가 예정
2. `pwdInitYn === "Y"` → 회원정보 설정 팝업 표시
3. 팝업 저장 시:
   - 비밀번호 재설정 링크 경유 → 기존 `POST /api/auth/password-reset/confirm` (token + newPassword)
   - 판매점 최초 로그인 → 신규 `POST /api/auth/password-init` (JWT 쿠키 + newPassword + email?)
4. 이메일 중복체크는 기존 `POST /api/auth/email/check` 그대로 사용

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-26 | Initial draft (화면설계서 p.11-15 기반) | CK |
| 0.2 | 2026-04-03 | 화면설계서 v1.1 페이지 번호 반영 | CK |
| 0.3 | 2026-04-03 | 판매점 최초 로그인 케이스 추가 (R-4 해결), 구현 상태 업데이트, 프론트 전달사항 추가 | CK |
