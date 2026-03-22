# 메뉴 관리 API Planning Document

> **Summary**: 2레벨 메뉴 구조 CRUD + 정렬/노출 설정 API
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 글로벌 네비게이션과 모바일 메뉴 구조를 동적으로 관리할 수단이 없음 |
| **Solution** | 2레벨(1-Level/2-Level) 메뉴 CRUD API — 정렬순서, Top/모바일 노출, 사용여부 관리 |
| **Function/UX Effect** | 좌측 1-Level 메뉴 클릭 시 우측 2-Level 표시, 정렬 드래그, Top메뉴/모바일 노출 토글 |
| **Core Value** | 메뉴 구조 변경 시 코드 수정 없이 관리자 화면에서 제어 가능 |

---

## 1. Overview

### 1.1 Purpose
Q.PARTNERS 네비게이션 메뉴를 관리하는 API. 화면설계서 p.51 기준.

### 1.2 Background
- TO-BE DB에 Menu 모델 이미 생성됨 (parentId 기반 트리)
- 권한관리(Available Menu Setting)에서 메뉴 목록을 참조

---

## 2. Scope

### 2.1 In Scope
- [ ] 메뉴 목록 조회 (1-Level + 2-Level 트리)
- [ ] 메뉴 등록 (menuCode 필수, 1-Level/2-Level)
- [ ] 메뉴 수정 (Menu Code Read-only, 나머지 수정 가능)
- [ ] 정렬순서 일괄 저장
- [ ] 사용여부 Y인 메뉴만 조회 필터
- [ ] Top 메뉴 노출 / 모바일 노출 설정

### 2.2 Out of Scope
- 메뉴 삭제 (사용여부 N으로 비활성화)
- 3레벨 이상 메뉴

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 1-Level 메뉴 목록 (사용여부 필터) | High | p.51 #4 |
| FR-02 | 1-Level 클릭 시 2-Level 하위 메뉴 표시 | High | p.51 #7 |
| FR-03 | 메뉴 등록 — Upper Menu(1-Level), Menu Name, Menu Code*, Page URL, 사용여부, Top메뉴노출, 모바일 | High | p.51 #2,3 |
| FR-04 | Menu Code Read-only (등록 후 수정 불가) | High | p.51 #7 |
| FR-05 | 정렬순서 일괄 저장 | High | p.51 #1 |
| FR-06 | Top 메뉴 노출 — 1레벨 메뉴만, Y이면 글로벌 네비 영역 표시 | Medium | p.51 #5 |
| FR-07 | 모바일 노출 — Y인 메뉴만 모바일 표시 | Medium | p.51 #6 |

---

## 4. API Endpoints

```
GET    /api/menus              → 메뉴 트리 목록
POST   /api/menus              → 메뉴 등록
PUT    /api/menus/[id]         → 메뉴 수정
PUT    /api/menus/sort         → 정렬순서 일괄 저장
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
