# 홈화면 공지 관리 API Planning Document

> **Summary**: 홈화면 상단 공지 메시지 CRUD API — 게시대상별/기간별 최대 5개
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 로그인 후 홈화면에 권한별로 공지 메시지를 게시해야 하며, 기간/대상 관리가 필요 |
| **Solution** | 게시대상(7종 권한) + 기간 설정 공지 CRUD API, 텍스트+하이퍼링크, 최대 5개 |
| **Function/UX Effect** | 공지 목록(검색/필터), 등록 팝업(게시대상 체크박스 + 기간 + 내용 + URL), 게시예정/게시중/종료 상태 |
| **Core Value** | 관리자가 코드 수정 없이 실시간 공지 관리 가능 |

---

## 1. Overview

### 1.1 Purpose
홈화면 상단에 노출되는 공지 메시지를 관리하는 API. 화면설계서 p.46-47 기준.

### 1.2 Background
- TO-BE DB에 HomeNotice 모델 이미 생성됨
- 게시대상: 슈퍼관리자/관리자/1차점/2차점이하/시공점/일반회원 (6종 체크박스)
- 최대 5개까지 등록 가능

---

## 2. Scope

### 2.1 In Scope
- [ ] 공지 목록 조회 (검색, 상태 필터, 게시대상 필터)
- [ ] 공지 등록 (게시대상 체크박스, 기간, 내용, URL)
- [ ] 공지 수정
- [ ] 공지 삭제
- [ ] 홈화면용 활성 공지 조회 (현재 사용자 권한에 맞는 게시중 공지)

### 2.2 Out of Scope
- 공지 정렬순서 관리 (등록일 기준 최신순)

---

## 3. Requirements

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 공지 목록 — 공지내용/등록자 검색, 공지상태(게시예정/게시중/종료) 필터, 게시대상 필터, 등록일 범위 | High | p.46 |
| FR-02 | 공지 등록 — 게시대상(6종 체크박스)*, 공지기간*, 공지내용*(텍스트), URL(선택) | High | p.47 |
| FR-03 | 최대 5개 제한 — 활성(게시예정+게시중) 공지 5개 초과 시 등록 불가 | High | p.46 Description |
| FR-04 | 공지 상태 자동 판별 — 현재일 기준 startAt/endAt으로 scheduled/active/ended | High | p.46 |
| FR-05 | 홈화면용 API — 현재 사용자 권한에 맞는 게시중(active) 공지만 반환 | High | — |
| FR-06 | 등록자/갱신자 자동 기록 | Medium | p.47 |

---

## 4. API Endpoints

```
GET    /api/home-notices             → 공지 목록 (관리자용)
POST   /api/home-notices             → 공지 등록
PUT    /api/home-notices/[id]        → 공지 수정
DELETE /api/home-notices/[id]        → 공지 삭제
GET    /api/home-notices/active      → 홈화면용 활성 공지 조회
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
