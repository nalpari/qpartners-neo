# 인증(로그인) API Planning Document

> **Summary**: QSP 외부 로그인 I/F를 활용한 판매점/시공점/일반회원 통합 인증 API
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-25
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | QPartners Neo에 인증 체계가 없어 로그인/세션 관리 불가 |
| **Solution** | QSP 로그인 API를 프록시하여 인증 처리, 자체 세션/토큰 관리 |
| **Function/UX Effect** | 사용자 유형별(관리자/1차판매점/2차판매점/일반) 로그인, 로그인 상태 유지 |
| **Core Value** | QSP 기존 사용자 DB 활용, 별도 회원 테이블 불필요 |

---

## 1. Overview

### 1.1 Purpose
QSP(Q Sales Platform)의 외부 로그인 API를 연동하여 QPartners Neo 사용자 인증을 처리한다.
사용자 정보는 QSP 측에서 관리하며, QPartners Neo는 인증 결과만 수신하여 세션을 관리한다.

### 1.2 Background
- QSP 측 사용자 테이블은 TO-BE DB에 생성하지 않음 (schema.prisma 주석 참고)
- Prisma 스키마에 UserType enum 정의됨: ADMIN, DEALER, SEKO, GENERAL
- PasswordResetToken, TwoFactorCode 모델은 이미 준비되어 있음
- 인증 후 userType + userId 조합으로 시스템 내 사용자 식별

### 1.3 External API Info
- **URL**: `https://jp-dev.qsalesplatform.com/api/qpartners/user/login`
- **Method**: POST
- **테스트 계정**:
  - 관리자: 1301011 / 1234
  - 1차 판매점: T01 / 1234
  - 2차 판매점: 201T01 / 1234
  - 일반: test1 / 1234

---

## 2. Scope

### 2.1 In Scope
- [ ] QSP 로그인 API 프록시 (POST /api/auth/login)
- [ ] 로그인 요청 유효성 검증 (Zod)
- [ ] QSP 응답 기반 세션/토큰 처리
- [ ] 로그아웃 API (POST /api/auth/logout)
- [ ] 클라이언트 인증 상태 관리 (Zustand store)

### 2.2 Out of Scope
- 회원가입 (QSP 측 관리)
- 비밀번호 변경/초기화 (추후 별도 구현)
- 2차 인증 (TwoFactorCode 모델 준비만 되어 있음)

---

## 3. Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | 로그인 ID + 비밀번호 + 사용자유형으로 QSP API 호출 | High | 필수 파라미터: loginId, pwd, userTp |
| FR-02 | accsSiteCd는 "QPARTNERS" 고정 | High | QPartners 전용 접근 코드 |
| FR-03 | QSP 응답 성공 시 인증 토큰/세션 생성 | High | |
| FR-04 | QSP 응답 실패 시 에러 메시지 전달 | High | |
| FR-05 | 로그아웃 시 세션/토큰 무효화 | Medium | |
| FR-06 | 클라이언트에서 인증 상태 관리 | High | Zustand store |

---

## 4. API Endpoints

```
POST   /api/auth/login    → QSP 로그인 프록시
POST   /api/auth/logout   → 로그아웃 (세션 무효화)
GET    /api/auth/me        → 현재 로그인 사용자 정보 (추후)
```

---

## 5. QSP Login API Request Format

```json
{
  "loginId": "test1",
  "pwd": "1234",
  "userTp": "GENERAL",
  "accsSiteCd": "QPARTNERS",
  "actLog": "LOGOUT",
  "requestId": "3132131313"
}
```

**userTp 매핑:**
| QSP userTp | QPartners UserType | 설명 |
|------------|-------------------|------|
| ADMIN | ADMIN | 관리자 |
| DEALER | DEALER | 판매점 (1차/2차) |
| SEKO | SEKO | 시공점 |
| GENERAL | GENERAL | 일반회원 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-25 | Initial draft | CK |
