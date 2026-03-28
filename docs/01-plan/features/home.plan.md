# 홈화면 (로그인 후) Planning Document

> **Summary**: 로그인 후 홈화면 — 최근 콘텐츠 + 최근 다운로드 표시
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **화면설계서**: p.20-21 (confirmed)

---

## 1. Overview

로그인 후 홈화면에 사용자 권한에 맞는 최근 콘텐츠(최대 4개)와 최근 다운로드 내역(최대 3개)을 표시.

---

## 2. Scope

### 2.1 In Scope
- [ ] 최근 콘텐츠 목록 API (사용자 권한 기반, 최대 4개)
- [ ] 최근 다운로드 내역 API (최대 3개)

### 2.2 Out of Scope
- 홈화면 UI (프론트 담당)
- GNB/사이드메뉴 레이아웃 (프론트 담당)

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 사용자 권한에 맞는 최근 콘텐츠 최대 4개 표시 | High | p.20 #1 |
| FR-02 | 상세보기 클릭 시 콘텐츠 상세 화면 이동 | High | p.20 #1 |
| FR-03 | 전체보기 클릭 시 콘텐츠 목록 화면 이동 | Medium | p.20 |
| FR-04 | 최근 다운로드 내역 3개 표시 | High | p.20 #2 |
| FR-05 | 다운로드 데이터 없으면 "다운로드 받은 데이터가 없습니다" 표시 | Medium | p.20 #2 |
| FR-06 | 열람기간 지났거나 삭제된 경우 취소선 표시 | Medium | p.20 #2 |

---

## 4. API Endpoints

```
GET /api/home/recent-contents    → 최근 콘텐츠 (권한 기반, 최대 4개)
GET /api/home/recent-downloads   → 최근 다운로드 (최대 3개)
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
