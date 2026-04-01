# 대량메일 발송 Planning Document

> **Summary**: 관리자용 대량메일 발송 (목록/등록/상세) + 3분 배치 발송
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **화면설계서**: p.48-50 (confirmed)

---

## 1. Overview

관리자가 권한별(슈퍼관리자/관리자/1차점/2차점이하/시공점/일반) 발송대상을 선택하여 대량메일을 발송. 등록 버튼 클릭 시 pending 상태로 저장되고, 3분마다 배치가 실행되어 pending 상태인 메일을 발송 처리.

---

## 2. Scope

### 2.1 In Scope
- [ ] 대량메일 목록 조회 API (검색, 페이징)
- [ ] 대량메일 등록 API (임시저장/발송)
- [ ] 대량메일 상세 조회 API
- [ ] 첨부파일 업로드
- [ ] 3분 배치 — pending 상태 메일 발송 처리
- [ ] 뉴스레터 수신거부 포함/제외 옵션

### 2.2 Out of Scope
- 대량메일 UI (프론트 담당)
- CC/BCC 수신자 (삭제 협의 완료)

---

## 3. Requirements

### 3.1 목록 (p.48)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 최근 발송 순으로 정렬 | High | p.48 #2 |
| FR-02 | 발송대상 콤마 구분 표시 | High | p.48 #3 |
| FR-03 | 제목 클릭 시 상세화면 이동 | High | p.48 #4 |
| FR-04 | 첨부파일 유무 N/Y 표시 | Medium | p.48 #5 |
| FR-05 | 임시저장만 보기 필터 | Medium | p.48 #6 |

### 3.2 등록 (p.49-50)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-06 | 보낸사람 표시명 | High | p.50 #1 |
| FR-07 | 발송대상 체크박스 (6개 권한) | High | p.50 #6 |
| FR-08 | 뉴스레터 수신거부 포함/제외 옵션 | High | p.50 #9 |
| FR-09 | 제목, 내용 (서명 디폴트) | High | p.50 #7 |
| FR-10 | 첨부파일 (Drag & Drop) | High | p.50 |
| FR-11 | 발송 버튼 → pending 상태, 3분 배치로 발송 | High | p.50 #8 |
| FR-12 | 임시저장 버튼 → draft 상태 | Medium | p.50 #8 |

---

## 4. API Endpoints

```
GET    /api/admin/mass-mails              → 목록 (검색, 페이징)
POST   /api/admin/mass-mails              → 등록 (draft 또는 pending)
GET    /api/admin/mass-mails/:id          → 상세 조회
```

---

## 5. 배치 처리

- 3분 주기로 실행
- qp_mass_mails에서 status = pending인 레코드 조회
- 발송대상별 이메일 수집:
  - QSP 사용자 (판매점/일반/관리자) → QSP에서 조회
  - 시공점 → AS-IS Seko User List API
- optOut 옵션에 따라 뉴스레터 수신거부 회원 포함/제외
- 개별 발송 (수신자 본인 정보만 표시)
- 발송 완료 시 status = sent, sentAt = NOW()

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
