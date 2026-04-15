# 인터페이스 로그 API Planning Document

> **Summary**: QSP(AS-IS) ↔ TO-BE 간 API 호출 이력을 기록·조회하는 인터페이스 로그 시스템
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-13
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | QSP 외부 API 호출 시 요청/응답 이력이 console.log로만 남아 추적·디버깅이 어려움 |
| **Solution** | qp_interface_log 테이블에 구조화된 로그 기록 + 관리자 조회 API 제공 |
| **Function/UX Effect** | QSP 호출마다 자동 로깅, 관리자 화면에서 이력 조회·필터링·검색 |
| **Core Value** | 외부 시스템 연동 장애 추적, API 응답시간 모니터링, 감사 로그 |

---

## 1. Overview

### 1.1 Purpose
AS-IS(QSP) ↔ TO-BE(Q.Partners Neo) 간 모든 API 호출을 qp_interface_log 테이블에 기록하고, 관리자가 조회할 수 있는 API를 제공한다.

### 1.2 Background
- DB 테이블 `qp_interface_log`는 이미 생성되어 있으며 12건의 데이터가 축적됨
- 현재 일부 API(login, mypage/profile, email/check)에서만 로깅되고 있음 (개발서버 기준)
- TO-BE 코드(`src/lib/qsp-member.ts` 등)에는 로깅 유틸리티가 미구현 상태
- QSP 호출 지점이 11개 파일에 분포

### 1.3 Scope

#### In Scope
1. **Prisma 스키마**: `qp_interface_log` 모델 추가 (DB 테이블과 동기화)
2. **로깅 유틸리티**: QSP API 호출 시 자동으로 인터페이스 로그를 기록하는 공통 함수
3. **조회 API**: 관리자용 인터페이스 로그 목록/상세 조회 엔드포인트
4. **기존 QSP 호출 지점 통합**: 11개 파일의 QSP 호출에 로깅 적용

#### Out of Scope
- 로그 삭제/보관 정책 (운영 단계에서 결정)
- 프론트엔드 화면 (백엔드 API만)
- 실시간 알림/모니터링 대시보드
- AS-IS 시공점 I/F 로깅 (협의 중 — 로거는 system 파라미터로 범용 대응 설계)

---

## 2. Current State Analysis

### 2.1 DB 테이블 (이미 존재)

| Column | Type | Description |
|--------|------|-------------|
| id | INT (PK, AI) | 로그 ID |
| trace_id | VARCHAR(36) | 요청 추적 UUID |
| system | VARCHAR(20) | 대상 시스템 (QSP 등) |
| direction | VARCHAR(10) | 호출 방향 (OUTBOUND/INBOUND) |
| api_name | VARCHAR(50) | API 이름 (login, userDetail 등) |
| method | VARCHAR(10) | HTTP 메서드 |
| request_url | VARCHAR(2000) | 요청 URL |
| request_body | TEXT | 요청 본문 (민감정보 마스킹) |
| response_status | INT | HTTP 응답 상태코드 |
| response_body | TEXT | 응답 본문 |
| result_code | VARCHAR(10) | 결과코드 (S/F 등) |
| duration_ms | INT | 소요시간 (ms) |
| caller_route | VARCHAR(255) | 호출한 API 라우트 |
| user_id | VARCHAR(255) | 요청 사용자 ID |
| user_type | VARCHAR(20) | 사용자 유형 |
| error_message | VARCHAR(500) | 에러 메시지 |
| created_at | DATETIME | 생성일시 |
| created_by | VARCHAR(255) | 생성자 (기본: SYSTEM) |

인덱스: trace_id, system+api_name+created_at, caller_route+created_at, result_code

### 2.2 QSP API 호출 지점 (11개 파일)

| # | 파일 | QSP API | 용도 |
|---|------|---------|------|
| 1 | auth/login/route.ts | login | 로그인 |
| 2 | auth/signup/route.ts | newUserReq | 회원가입 |
| 3 | auth/email/check/route.ts | userDetail | 이메일 중복체크 |
| 4 | auth/password-reset/request/route.ts | userDetail | 비밀번호 초기화 요청 |
| 5 | auth/password-reset/confirm/route.ts | userPwdChg | 비밀번호 초기화 확인 |
| 6 | auth/password-init/route.ts | userPwdChg | 비밀번호 초기화 |
| 7 | auth/two-factor/verify/route.ts | updateSecAuthDt | 2FA 인증 |
| 8 | mypage/profile/route.ts (GET) | userDetail | 프로필 조회 |
| 9 | mypage/profile/route.ts (PUT) | updateUserDtl | 프로필 수정 |
| 10 | mypage/password-change/route.ts | userPwdChg | 비밀번호 변경 |
| 11 | admin/members/route.ts | userListMng | 회원 목록 조회 |
| 12 | admin/members/[id]/route.ts | updateUserDtlMng | 회원정보 수정 |

### 2.3 현재 로깅 현황 (DB 기준)

| api_name | caller_route | 건수 |
|----------|-------------|------|
| login | POST /api/auth/login | 5 |
| updateUserDtl | PUT /api/mypage/profile | 2 |
| userDetail | GET /api/mypage/profile | 3 |
| userDetail | POST /api/auth/email/check | 2 |

→ 12개 호출 지점 중 4개만 로깅 중. 나머지 8개 적용 필요.

---

## 3. Implementation Plan

### Phase 1: Prisma 스키마 + 로깅 유틸리티
1. `prisma/schema.prisma`에 `QpInterfaceLog` 모델 추가
2. `prisma db push`로 동기화 확인
3. `src/lib/interface-logger.ts` — QSP fetch wrapper 구현
   - trace_id(UUID) 자동 생성
   - 요청/응답 자동 기록
   - duration_ms 자동 측정
   - 민감정보(password 등) 마스킹
   - 에러 시에도 반드시 로그 기록

### Phase 2: 기존 QSP 호출 지점에 로거 적용
1. `src/lib/qsp-member.ts`의 `fetchQspUserDetail` 함수에 로거 통합
2. 나머지 11개 파일의 직접 fetch 호출을 로거 경유로 변경
3. 기존 console.log/error 기반 로깅은 유지 (구조화 로그와 병행)

### Phase 3: 관리자 조회 API
1. `GET /api/tests/interface-log` — 목록 조회 (필터: system, api_name, result_code, 날짜 범위)
2. `GET /api/tests/interface-log/:id` — 상세 조회 (request_body, response_body 포함)
3. OpenAPI 스펙 업데이트

---

## 4. Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| 로깅 방식 | 범용 fetch wrapper (system 파라미터) | QSP뿐 아니라 향후 시공점 I/F 등 다른 외부 시스템에도 동일 로거 사용 |
| 민감정보 처리 | request_body에서 password 필드 마스킹 | PII 보호 |
| 로그 실패 처리 | 로그 기록 실패 시 본 요청은 계속 진행 | 로깅이 비즈니스 로직을 블로킹하지 않음 |
| 조회 권한 | 관리자(ADMIN) 전용 | 민감 정보 포함 가능 |
| 엔드포인트 경로 | /api/tests/interface-log | 기존 tests 하위 구조 활용 |

---

## 5. Dependencies

| Item | Status | Impact |
|------|--------|--------|
| qp_interface_log 테이블 | ✅ 이미 존재 | 없음 |
| QSP API 연동 코드 | ✅ 이미 구현 | 로거 래핑만 필요 |
| Prisma 스키마 동기화 | ⏳ 필요 | Phase 1에서 처리 |

---

## 6. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 로깅으로 인한 API 응답 지연 | Medium | 로그 기록을 비동기(fire-and-forget)로 처리 |
| response_body 대용량 | Low | TEXT 타입이므로 문제 없으나, 필요시 truncate |
| 기존 로깅과 중복 | Low | console 로그는 유지하되 구조화 로그로 전환 |
