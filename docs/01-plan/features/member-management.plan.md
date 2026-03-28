# 회원관리 (관리자) Planning Document

> **Summary**: 관리자용 회원 목록 조회 + 회원 상세정보 팝업 (조회/수정)
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **화면설계서**: p.46-47 (confirmed)

---

## 1. Overview

관리자가 시공점을 제외한 전체 회원을 조회/관리하는 기능. 회원 상세정보에서 사용자 권한 변경(일반회원만), 비밀번호 초기화, 2차인증/알림 설정, 회원상태 관리 등을 처리.

---

## 2. Scope

### 2.1 In Scope
- [ ] 회원 목록 조회 API (검색, 페이징, 시공점 제외)
- [ ] 회원 상세정보 조회 API
- [ ] 회원 상세정보 수정 API (권한, 2차인증, 알림, 상태 등)
- [ ] 비밀번호 초기화 (관리자가 사용자 이메일로 초기화 링크 발송)

### 2.2 Out of Scope
- 회원관리 UI (프론트 담당)
- 시공점 회원 관리 (회원관리 대상 아님)

---

## 3. Requirements

### 3.1 회원 목록 (p.46)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 시공점 회원 제외한 목록 표시 | High | p.46 |
| FR-02 | 검색: ID, 성명, 이메일, 회원유형, 회사명, 상태 | High | p.46 #2 |
| FR-03 | 상태: Active/Delete/탈퇴 | High | p.46 #3 |
| FR-04 | 성명 클릭 시 상세 팝업 호출 | High | p.46 #1 |
| FR-05 | 페이징 (20개 단위) | High | p.46 |

### 3.2 회원 상세정보 (p.47)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-06 | 등록일/갱신일시(수정자) 표시 | Medium | p.47 #1 |
| FR-07 | 비밀번호 초기화 — 이메일로 초기화 링크 발송 | High | p.47 #2 |
| FR-08 | 사용자권한 — 일반회원만 변경 가능 (1차판매점/2차이후판매점/시공점/일반) | High | p.47 #3 |
| FR-09 | 2차 인증 — 유효/무효 설정 | High | p.47 #5 |
| FR-10 | 로그인 알림받기 — 유효/무효 설정 | Medium | p.47 #6 |
| FR-11 | 속성변경 알림받기 — 유효/무효 설정 | Medium | p.47 #7 |
| FR-12 | 회원상태 — Active/Delete 변경 | High | p.47 #8 |
| FR-13 | 탈퇴일시/탈퇴사유 표시 (일반회원 탈퇴 시) | Medium | p.47 #9 |
| FR-14 | 뉴스레터 수신 — 허용/거부 + 변경일자 표시 | Medium | p.47 #10 |

---

## 4. API Endpoints

```
GET    /api/admin/members              → 회원 목록 (검색, 페이징)
GET    /api/admin/members/:id          → 회원 상세정보
PUT    /api/admin/members/:id          → 회원 상세정보 수정
POST   /api/admin/members/:id/reset-password  → 비밀번호 초기화 (이메일 발송)
```

---

## 5. 데이터 소스

회원 정보는 qp_info 테이블 + 외부 API 조합:
- 회원 목록/상세: qp_info + QSP user detail API
- 권한/상태/알림 설정: qp_info 테이블에서 관리
- 비밀번호 초기화: TO-BE 자체 처리 (PasswordResetToken + 메일 발송)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
