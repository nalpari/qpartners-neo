# 코드 관리 API Planning Document

> **Summary**: 시스템 공통코드(Header Code + Code Detail) CRUD API
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 시스템 전반에서 사용하는 공통코드(상태, 회사, 자재그룹 등)를 관리할 수단이 없음 |
| **Solution** | Header Code + Code Detail 2단계 구조의 공통코드 CRUD API |
| **Function/UX Effect** | Header Code/Name Like 검색, Header 클릭 시 하위 Detail 표시, 인라인 편집, Header Code 수정 불가 |
| **Core Value** | 시스템 전반의 코드값 통합 관리, 하드코딩 제거 |

---

## 1. Overview

### 1.1 Purpose
Q.PARTNERS에서 사용하는 시스템 공통코드를 등록/관리하는 API. 화면설계서 p.57 기준.

### 1.2 Background
- TO-BE DB에 CodeHeader, CodeDetail 모델 이미 생성됨
- 예시: STAT_CD(Status), COMPANY, MATL_GR(Material Group), MATL_TP(Material Type)

---

## 2. Scope

### 2.1 In Scope
- [ ] Header Code 목록 조회 (검색, 사용여부 필터)
- [ ] Header Code 등록
- [ ] Header Code 수정 (headerCode 수정 불가)
- [ ] Code Detail 목록 조회 (Header별)
- [ ] Code Detail 등록/수정/삭제
- [ ] 사용여부 Y인 데이터만 조회 필터

### 2.2 Out of Scope
- Header Code 삭제 (사용 중인 코드 삭제 방지)

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | Header Code/Name Like 검색 | High | p.57 #1 |
| FR-02 | 사용여부 Y인 데이터만 조회 필터 | Medium | p.57 #4 |
| FR-03 | Header Code 추가 — headerCode, headerId, headerName, relCode1~3, relNum1~3, 사용여부 | High | p.57 #2 |
| FR-04 | Header Code 저장 시 검색조건 유지 | Medium | p.57 #3 |
| FR-05 | Header Code 클릭 시 하위 Code Detail 표시 | High | p.57 #5 |
| FR-06 | Code Detail 인라인 수정 — Header Code는 수정 불가 | High | p.57 #5 |
| FR-07 | Code Detail — code, displayCode, codeName, codeNameEtc, relCode1~2, relNum1, sortOrder, 사용여부 | High | p.57 |

---

## 4. API Endpoints

```
GET    /api/codes                        → Header Code 목록
POST   /api/codes                        → Header Code 등록
PUT    /api/codes/[id]                   → Header Code 수정
GET    /api/codes/[id]/details           → Code Detail 목록
POST   /api/codes/[id]/details           → Code Detail 등록
PUT    /api/codes/[id]/details/[detailId] → Code Detail 수정
DELETE /api/codes/[id]/details/[detailId] → Code Detail 삭제
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
