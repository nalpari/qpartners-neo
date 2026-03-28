# 마이페이지 Planning Document

> **Summary**: 내정보/회사정보 조회·수정 + 비밀번호 변경 + 회원탈퇴
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **화면설계서**: p.35-40 (confirmed)

---

## 1. Overview

마이페이지에서 회원유형별(일반/판매점/시공점/관리자) 내정보 및 회사정보를 조회·수정하고, 비밀번호 변경 및 회원탈퇴(일반회원만) 기능을 제공.

---

## 2. Scope

### 2.1 In Scope
- [ ] 내정보/회사정보 조회 API (회원유형별 차별화)
- [ ] 내정보/회사정보 수정 API (회원유형별 수정 가능 항목 차별화)
- [ ] 비밀번호 변경 API (현재 비밀번호 + 신규 비밀번호)
- [ ] 회원탈퇴 API (일반회원만)
- [ ] 시공점 — 시공ID 정보 조회 (AS-IS I/F: Seko User Info API)
- [ ] 시공점 — 첨부파일 다운로드 (AS-IS I/F: Seko File Download API)

### 2.2 Out of Scope
- 마이페이지 UI (프론트 담당)
- 주소검색 (프론트에서 zipcloud API 직접 호출)
- 시공ID 정보 상세확인 (Auto Login으로 AS-IS 이동)
- WEB연수신청 (AS-IS 페이지 링크)

---

## 3. Requirements

### 3.1 내정보/회사정보 조회 (p.35-38)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 회원유형별 표시 항목 차별화 | High | p.35-38 |
| FR-02 | 시공점: 부서명, 직책, 법인번호 숨김 | High | p.37 |
| FR-03 | 일반회원: 법인번호 숨김 | High | p.35 |
| FR-04 | 시공점: 시공ID 정보 (시공ID, 취득일, 만료일) 표시 | High | p.37 |
| FR-05 | 시공점: supplierKind 5,6,7인 경우 비고에 시공점명 표시 | Medium | p.37 #3 |
| FR-06 | 시공점: 문서 다운로드 (수강료영수증/시공증명서) | High | p.37 #4 |
| FR-07 | 뉴스레터 수신 상태 + 변경일자 표시 | Medium | p.35 #7 |
| FR-08 | 회원탈퇴 버튼 — 일반회원만 | Medium | p.35 #8 |

### 3.2 내정보/회사정보 수정 (p.32, 34, 36, 38)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-09 | 수정 가능한 항목만 표시 | High | p.32 |
| FR-10 | 시공점: 법인번호, 부서명, 직책 숨김 | High | p.38 |
| FR-11 | 일반회원: 법인번호 숨김 | High | p.36 |
| FR-12 | 판매점: FAX 필수 | High | p.32 |
| FR-13 | 성명 — 성/이름 분리 저장 유도 | Medium | p.32 #4 |
| FR-14 | 관리자: Q.ORDER 판매점 T01 data 변경 (QSP 업데이트 X) | High | p.34 #5 |

### 3.3 비밀번호 변경 (p.39)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-15 | 현재 비밀번호 입력 + 검증 | High | p.39 #1 |
| FR-16 | 신규 비밀번호 입력 (마스킹) | High | p.39 #2 |
| FR-17 | 신규 비밀번호 재입력 | High | p.39 #3 |
| FR-18 | 비밀번호 정책: 영문대문자+소문자+숫자 조합, 8자 이상 | High | p.39 |
| FR-19 | 현재 비밀번호 불일치 Alert | High | p.39 |
| FR-20 | 성공 시 Alert "비밀번호가 변경되었습니다" + 팝업 닫기 | High | p.39 |

### 3.4 회원탈퇴 (p.40)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-21 | 일반회원만 탈퇴 가능 | High | p.40 |
| FR-22 | 탈퇴사유 입력 (필수) | High | p.40 #1 |
| FR-23 | 탈퇴 처리 후 홈화면 이동 | High | p.40 #3 |
| FR-24 | 회원관리에 탈퇴일시, 사유 표시 | High | p.40 #3 |

---

## 4. API Endpoints

```
# 내정보/회사정보
GET    /api/mypage/profile           → 조회 (회원유형별)
PUT    /api/mypage/profile           → 수정

# 비밀번호 변경
POST   /api/mypage/change-password   → 비밀번호 변경 (chgType=C)

# 회원탈퇴
POST   /api/mypage/withdraw          → 탈퇴 (일반회원만)

# 시공점 전용 (AS-IS I/F 프록시)
GET    /api/mypage/seko-info          → 시공ID 정보 조회
GET    /api/mypage/seko-file          → 첨부파일 다운로드
```

---

## 5. 회원유형별 데이터 소스

| 회원유형 | 조회/수정 대상 | 비밀번호 변경 |
|---------|---------------|-------------|
| 판매점 (DEALER) | QSP API | QSP userPwdChg (chgType=C) |
| 일반 (GENERAL) | QSP API | QSP userPwdChg (chgType=C) |
| 시공점 (SEKO) | AS-IS Seko User Info API | AS-IS Seko Password Change API (chgType=C) |
| 관리자 (ADMIN) | QSP API (T01 판매점 data) | QSP userPwdChg (chgType=C) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
