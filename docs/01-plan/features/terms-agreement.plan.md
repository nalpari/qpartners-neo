# 이용약관 동의 필수 보기 Planning Document

> **Summary**: 로그인 시 이용약관 동의 체크박스 필수 — 미동의 시 로그인 버튼 비활성화
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-25
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 로그인 시 이용약관 동의 절차가 없음 |
| **Solution** | 로그인 폼에 이용약관 동의 체크박스 추가, 미체크 시 로그인 버튼 비활성화 |
| **Function/UX Effect** | 매 로그인 시 약관 동의 필수, 약관 내용 보기 링크 제공 |
| **Core Value** | 법적 준거 확보, 사용자 동의 기반 서비스 이용 |

---

## 1. Overview

### 1.1 Purpose
로그인 화면에서 이용약관 동의를 필수로 받아 로그인 버튼을 활성화한다.
매 로그인 시마다 체크가 필요하며, 동의 이력은 별도 저장하지 않는다.

### 1.2 Background
- 로그인 API (`POST /api/auth/login`)는 이미 구현 완료
- 약관 내용 및 UI는 화면설계서 기반으로 프론트 담당자가 처리
- 이 Plan은 프론트 담당자에게 전달할 요구사항 정의 목적

---

## 2. Scope

### 2.1 In Scope (프론트 영역)
- [ ] 로그인 폼에 이용약관 동의 체크박스 추가
- [ ] 체크박스 미체크 시 로그인 버튼 disabled 상태
- [ ] 체크박스 체크 시 로그인 버튼 활성화
- [ ] 이용약관 내용 보기 (팝업 또는 페이지 링크)

### 2.2 Out of Scope
- 이용약관 동의 이력 DB 저장 (매번 체크하므로 불필요)
- 백엔드 API 변경 (기존 로그인 API 그대로 사용)
- 약관 내용 CMS 관리 (정적 콘텐츠로 처리)

---

## 3. Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | 로그인 폼에 이용약관 동의 체크박스 표시 | High | 기본값: 미체크 |
| FR-02 | 체크박스 미체크 시 로그인 버튼 비활성화 | High | disabled 스타일 적용 |
| FR-03 | 이용약관 전문 보기 기능 | High | 화면설계서 참고 |
| FR-04 | 매 로그인 시마다 체크 필요 (상태 유지 안 함) | High | |

---

## 4. Technical Notes

- **백엔드 변경 없음**: 기존 `POST /api/auth/login` API 그대로 사용
- **프론트 전용**: 체크박스 상태에 따른 버튼 활성화/비활성화는 클라이언트에서 처리
- **약관 콘텐츠**: 화면설계서 기반, 정적 또는 별도 관리

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-25 | Initial draft | CK |
