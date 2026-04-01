# 다운로드 기록 Planning Document

> **Summary**: 마이페이지 > 자료다운로드에서 다운로드 받은 내역 조회
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **화면설계서**: p.41 (confirmed)

---

## 1. Overview

마이페이지에서 사용자가 자료다운로드를 통해 다운로드한 내역을 조회. 제목/자료명 검색, 페이징 제공.

---

## 2. Scope

### 2.1 In Scope
- [ ] 다운로드 기록 목록 조회 API (검색, 페이징)

### 2.2 Out of Scope
- 다운로드 기록 UI (프론트 담당)

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 제목 또는 자료명으로 Like 검색 | High | p.41 #1 |
| FR-02 | 검색 결과 수 표시 | Medium | p.41 #1a |
| FR-03 | 최근 다운로드 순으로 정렬 | High | p.41 #2 |
| FR-04 | 콘텐츠 제목 표시 | High | p.41 #3 |
| FR-05 | 자료명 표시 + 삭제/열람기간 지난 경우 취소선, 다운로드 버튼 숨김 | High | p.41 #4 |
| FR-06 | 페이징 (20개 단위) | High | p.41 |

---

## 4. API Endpoints

```
GET /api/mypage/download-logs?keyword=&page=1&pageSize=20
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
