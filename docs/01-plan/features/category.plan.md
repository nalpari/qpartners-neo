# 카테고리 관리 API Planning Document

> **Summary**: 콘텐츠 분류용 2Depth 트리형 카테고리 CRUD API
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 콘텐츠를 8종 카테고리(정보유형/업무분류/제품분류 등)로 분류해야 하며, 관리자가 트리 구조로 관리 필요 |
| **Solution** | 2Depth 트리형 카테고리 CRUD API — 사내전용 옵션, 카테고리코드 관리, 정렬순서 지원 |
| **Function/UX Effect** | 트리형태 좌측 목록 + 우측 상세정보, 1Depth 코드 수동입력/2Depth 자동채번, 코드/상위카테고리 수정 불가 |
| **Core Value** | 콘텐츠 검색/필터링의 기반 데이터, 자체 DB 완결 |

---

## 1. Overview

### 1.1 Purpose
콘텐츠에 연결되는 카테고리를 관리하는 API. 화면설계서 p.53 기준.

### 1.2 Background
- TO-BE DB에 Category 모델 이미 생성됨 (parentId 기반 트리)
- 콘텐츠 등록/검색 시 카테고리를 참조하므로, 콘텐츠 API보다 먼저 또는 동시 구현 필요

---

## 2. Scope

### 2.1 In Scope
- [ ] 카테고리 목록 조회 (트리 구조)
- [ ] 카테고리 등록 (1Depth/2Depth)
- [ ] 카테고리 수정 (코드/상위카테고리 수정 불가)
- [ ] 카테고리 삭제
- [ ] 사내회원 전용 필터

### 2.2 Out of Scope
- 3Depth 이상 카테고리 (2Depth까지만)
- 카테고리 코드 자동채번 서버 로직 (2Depth는 프론트에서 채번 후 전달)

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 카테고리 트리 목록 조회 (1Depth + 하위 2Depth) | High | p.53 #2 |
| FR-02 | 사내회원 전용 카테고리만 보기 필터 | Medium | p.53 #1 |
| FR-03 | 카테고리 등록 — 사내전용(Y/N), 상위카테고리, Depth, 코드, 이름, 표시순서, 사용여부 | High | p.53 #3,4 |
| FR-04 | 카테고리코드 — 1Depth: 수동입력, 2Depth: 1Depth 기준 자동채번 | High | p.53 #10 |
| FR-05 | 카테고리코드 중복 체크 | High | p.53 #4 |
| FR-06 | 카테고리 수정 — 코드/상위카테고리 수정 불가 | High | p.53 #2 |
| FR-07 | 카테고리 삭제 — Confirm 후 목록에서 제거 | Medium | p.53 #5 |

---

## 4. API Endpoints

```
GET    /api/categories          → 카테고리 트리 목록
POST   /api/categories          → 카테고리 등록
PUT    /api/categories/[id]     → 카테고리 수정
DELETE /api/categories/[id]     → 카테고리 삭제
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
