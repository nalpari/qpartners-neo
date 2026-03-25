# 권한 관리 API Planning Document

> **Summary**: 역할(Role)별 메뉴 CRUD 권한 설정 API
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 7종 권한(SuperADMIN~비회원)별로 접근 가능 메뉴와 CRUD 권한을 동적으로 관리해야 함 |
| **Solution** | Role 목록 관리 + Available Menu Setting 팝업으로 메뉴별 Read/Create/Update/Delete 권한 설정 |
| **Function/UX Effect** | 권한 목록에서 Menu 버튼 클릭 → 2레벨 메뉴 체크박스 팝업, 일괄 저장 |
| **Core Value** | 코드 수정 없이 권한 체계 변경 가능, 콘텐츠 접근제어의 기반 |

---

## 1. Overview

### 1.1 Purpose
권한(Role)을 정의하고, 각 권한별로 메뉴 접근 CRUD 권한을 설정하는 API. 화면설계서 p.49-50 기준.

### 1.2 Background
- TO-BE DB에 QpRole, QpRoleMenuPermission 모델 이미 생성됨
- Menu 모델과 연관 (Available Menu Setting에서 메뉴 목록 참조)
- 7종 권한: SuperADMIN, ADMIN, Cus1(1차점), Cus2(2차이하), Cus3(시공점), Cus4(일반), Cus5(비회원)

---

## 2. Scope

### 2.1 In Scope
- [ ] 권한(Role) 목록 조회 (사용여부 필터)
- [ ] 권한 추가 (roleCode, roleName, description)
- [ ] 권한 수정 (roleCode 수정 불가)
- [ ] 메뉴별 CRUD 권한 조회 (Available Menu Setting)
- [ ] 메뉴별 CRUD 권한 일괄 저장

### 2.2 Out of Scope
- 권한 삭제 (사용여부 N으로 비활성화)
- 사용자별 개별 권한 부여 (역할 기반만)

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 권한 목록 조회 — 권한코드, 권한명, 권한설명, 사용여부, Menu 버튼 | High | p.54 |
| FR-02 | 사용여부 Y인 데이터만 조회 필터 | Medium | p.54 #3 |
| FR-03 | 권한 추가 — 테이블 상단에 신규 행 생성 | High | p.54 #1 |
| FR-04 | 권한 저장 — 권한코드 수정 불가, 권한 설명 수정 가능 | High | p.54 #2 |
| FR-05 | Available Menu Setting 팝업 — 2레벨 메뉴 목록 + Read/Create/Update/Delete 체크박스 | High | p.55 |
| FR-06 | 메뉴 권한 일괄 저장 | High | p.55 #5 |
| FR-07 | 메뉴에 URL 등록 여부(Y) 표시 | Medium | p.55 #3 |

---

## 4. API Endpoints

```
GET    /api/roles                           → 권한 목록
POST   /api/roles                           → 권한 추가
PUT    /api/roles/[roleCode]                → 권한 수정
GET    /api/roles/[roleCode]/permissions    → 메뉴별 CRUD 권한 조회
PUT    /api/roles/[roleCode]/permissions    → 메뉴별 CRUD 권한 일괄 저장
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
