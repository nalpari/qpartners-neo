# 콘텐츠 CRUD API Planning Document

> **Summary**: Q.PARTNERS 콘텐츠(자료/뉴스) 관리 API — 목록조회, 등록, 상세조회, 수정, 삭제
>
> **Project**: qpartners-neo
> **Version**: 0.1.0
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 판매점/시공점/일반회원에게 태양광 제품 자료와 뉴스를 제공해야 하지만, 현재 비즈니스 API가 없음 |
| **Solution** | 화면설계서 v1.0 기준 콘텐츠 CRUD API 구현 — 게시대상별 접근제어, 8종 카테고리 필터, 첨부파일 관리 포함 |
| **Function/UX Effect** | 권한별 콘텐츠 노출, 다중 카테고리 OR 검색, 파일 미리보기/ZIP 다운로드, 페이지네이션(20/50/100건) |
| **Core Value** | 외부 I/F 의존 없이 자체 DB로 완결되는 핵심 비즈니스 기능, 프로젝트 첫 도메인 API |

---

## 1. Overview

### 1.1 Purpose

Q.PARTNERS 플랫폼의 핵심 기능인 콘텐츠(제품 자료, 뉴스, 기술 문서 등) 관리 API를 구현한다.
관리자가 콘텐츠를 등록/수정하고, 회원유형별 게시대상에 따라 접근을 제어하며, 첨부파일 다운로드 기록을 관리한다.

### 1.2 Background

- 화면설계서 v1.0 (p.22~31)에 콘텐츠 목록/등록/조회/수정 화면이 정의됨
- TO-BE DB에 Content, ContentTarget, ContentCategory, ContentAttachment, DownloadLog 모델이 이미 생성됨
- 외부 I/F(QSP, AS-IS Q.Partners) 의존성 없이 자체 DB로 완결 가능
- 인증 API 구현 전이므로, 인증은 임시 미들웨어로 처리하고 추후 연동

### 1.3 Related Documents

- 화면설계서: `D:\인터플러그\Qpartners\화면설계서\(Q.Partners) 화면설계서_v1.0_260324(PDF).pdf` (p.22~31)
- TO-BE DB 설계: `docs/02-design/features/to-be-db-v2.design.md`
- Prisma Schema: `prisma/schema.prisma` (Content 관련 5개 모델)

---

## 2. Scope

### 2.1 In Scope

- [ ] 콘텐츠 목록 조회 API (검색, 카테고리 필터, 페이지네이션)
- [ ] 콘텐츠 등록 API (관리정보, 게시대상, 카테고리, 본문, 첨부파일)
- [ ] 콘텐츠 상세 조회 API (조회수 증가, 권한 체크)
- [ ] 콘텐츠 수정 API (갱신담당자 자동 업데이트)
- [ ] 콘텐츠 삭제 API (권한 기반 삭제 제어)
- [ ] 첨부파일 업로드/다운로드 API
- [ ] 다운로드 기록 API (마이페이지용)
- [ ] Zod 입력 검증 스키마

### 2.2 Out of Scope

- 인증/인가 미들웨어 (추후 인증 API 구현 시 통합)
- 프론트엔드 페이지 (Front 담당자 영역)
- 파일 스토리지 인프라 (로컬 파일시스템으로 우선 구현)
- 콘텐츠 승인 워크플로우 (v2에서 검토)
- 전체 ZIP 다운로드 (v2에서 검토)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status | 화면설계서 |
|----|-------------|----------|--------|-----------|
| FR-01 | 콘텐츠 목록 조회 — 키워드 검색 + 8종 카테고리 OR 필터 | High | Pending | p.22~24 |
| FR-02 | 콘텐츠 목록 — 페이지네이션 (20/50/100건), 정렬 | High | Pending | p.24 |
| FR-03 | 콘텐츠 목록 — 게시대상/담당부문 필터 (관리자 전용) | Medium | Pending | p.24 |
| FR-04 | 콘텐츠 목록 — New/Update 아이콘 판별 (등록일/갱신일 기준 5일) | Low | Pending | p.22 |
| FR-05 | 콘텐츠 등록 — 관리정보 (게재담당자/게재일/담당부문/최종승인자) | High | Pending | p.25~26 |
| FR-06 | 콘텐츠 등록 — 게시대상 (1차점/2차점이하/시공점/일반/비회원) + 기간 설정 | High | Pending | p.25 |
| FR-07 | 콘텐츠 등록 — 카테고리 8종 복수 선택 | High | Pending | p.25~26 |
| FR-08 | 콘텐츠 등록 — 제목 + 본문(에디터 HTML) + 첨부파일(D&D) | High | Pending | p.27 |
| FR-09 | 콘텐츠 상세 조회 — 조회수 카운트, URL 복사, 카테고리 태그 | High | Pending | p.28~29 |
| FR-10 | 콘텐츠 상세 — 첨부파일 미리보기(PDF/이미지) + 개별 다운로드 | Medium | Pending | p.29 |
| FR-11 | 콘텐츠 수정 — 게재담당자/게재일 Read-only, 갱신담당자 자동 업데이트 | High | Pending | p.30~31 |
| FR-12 | 콘텐츠 삭제 — 슈퍼관리자는 동일부문만, 단일관리자는 본인 등록만 | Medium | Pending | p.29 |
| FR-13 | 첨부파일 업로드 — 파일 저장 + 메타데이터(파일명/크기/MIME) 기록 | High | Pending | p.27 |
| FR-14 | 다운로드 기록 조회 — 제목/자료명 Like 검색, 삭제/기간만료 시 취소선 | Medium | Pending | p.42 |
| FR-15 | 사내회원(슈퍼관리자+관리자) 게시대상 무관 항상 조회 가능 | High | Pending | 비즈니스 규칙 |
| FR-16 | 사내전용 카테고리 빨간색 표시 + 권한자에게만 노출 | Medium | Pending | 비즈니스 규칙 |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 목록 API 응답 < 500ms (1,000건 기준) | 로컬 테스트 |
| Security | SQL Injection 방지 (Prisma 파라미터 바인딩) | 코드 리뷰 |
| Validation | 모든 입력 Zod safeParse 검증 | 린트 체크 |
| Coding | TypeScript strict, any 금지, React Compiler 규칙 준수 | pnpm lint |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 모든 Functional Requirements(FR-01~FR-16) 구현
- [ ] Zod 스키마로 입력 검증
- [ ] pnpm lint 통과 (에러 0, 경고 최소화)
- [ ] pnpm build 성공
- [ ] API 수동 테스트 완료 (curl 또는 REST client)

### 4.2 Quality Criteria

- [ ] Zero lint errors
- [ ] Build succeeds
- [ ] 모든 API endpoint에 에러 핸들링 (400/404/500)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 인증 미들웨어 미구현 상태에서 접근제어 로직 | Medium | High | 임시 헤더 기반 사용자 식별, 추후 JWT 연동으로 교체 |
| 파일 업로드 대용량 처리 | Medium | Medium | Next.js Route Handler bodyParser 제한 → multipart 처리 방식 결정 필요 |
| 카테고리 8종 OR 필터 쿼리 복잡도 | Low | Medium | Prisma where 조건 동적 생성, 인덱스 활용 |
| 게시대상별 기간 필터링 성능 | Low | Low | ContentTarget 인덱스 이미 설정됨 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, BaaS | Web apps with backend | ☐ |
| **Enterprise** | Strict layer separation, DI | High-traffic systems | ☒ |

→ 기존 프로젝트 아키텍처(Next.js 16 App Router + Prisma + MariaDB) 유지

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js 16 App Router | Next.js 16 | 기존 프로젝트 |
| ORM | Prisma 7 | Prisma 7 | 기존 프로젝트 |
| Validation | Zod | Zod | CLAUDE.md 규칙 |
| API Client | Axios | Axios | 기존 설정 (src/lib/axios.ts) |
| 파일 저장 | 로컬 / S3 / 외부 스토리지 | 로컬 (public/uploads) | 초기 구현, 추후 스토리지 이관 |

### 6.3 API Endpoint 설계

```
POST   /api/contents              → 콘텐츠 등록
GET    /api/contents              → 콘텐츠 목록 조회
GET    /api/contents/:id          → 콘텐츠 상세 조회
PUT    /api/contents/:id          → 콘텐츠 수정
DELETE /api/contents/:id          → 콘텐츠 삭제

POST   /api/contents/:id/files    → 첨부파일 업로드
GET    /api/contents/:id/files/:fileId/download → 첨부파일 다운로드

GET    /api/download-logs         → 다운로드 기록 조회
```

### 6.4 DB 모델 (이미 생성됨)

```
Content ──┬── ContentTarget (1:N, 게시대상별 기간)
          ├── ContentCategory (N:M, 카테고리 연결)
          ├── ContentAttachment (1:N, 첨부파일)
          └── DownloadLog (1:N, 다운로드 기록)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [x] `docs/coding-conventions.md` exists
- [x] ESLint configuration (`eslint.config.mjs`, flat config v9)
- [x] TypeScript strict mode
- [x] Prisma schema defined

### 7.2 API Convention (이 기능에서 정립)

| Category | Rule |
|----------|------|
| Route Handler 위치 | `src/app/api/contents/route.ts`, `src/app/api/contents/[id]/route.ts` |
| Zod 스키마 위치 | `src/lib/schemas/content.ts` |
| 응답 포맷 | `{ data, meta? }` (성공), `{ error, message }` (실패) |
| 페이지네이션 | `{ data, meta: { total, page, pageSize, totalPages } }` |
| HTTP 상태코드 | 200(조회), 201(생성), 400(검증실패), 404(미존재), 500(서버에러) |
| 에러 핸들링 | try-catch + NextResponse.json, Zod safeParse 실패 시 400 |

### 7.3 임시 인증 처리

인증 API 구현 전까지 요청 헤더로 사용자 식별:

```
X-User-Source: qsp | seko | general
X-User-Id: {외부 사용자 ID}
X-User-Role: super_admin | admin | first_dealer | second_dealer | constructor | general | non_member
```

→ 추후 JWT 토큰 기반 인증으로 교체

---

## 8. Implementation Order

1. [ ] Zod 스키마 작성 (`src/lib/schemas/content.ts`)
2. [ ] 콘텐츠 등록 API (POST /api/contents)
3. [ ] 콘텐츠 목록 조회 API (GET /api/contents)
4. [ ] 콘텐츠 상세 조회 API (GET /api/contents/:id)
5. [ ] 콘텐츠 수정 API (PUT /api/contents/:id)
6. [ ] 콘텐츠 삭제 API (DELETE /api/contents/:id)
7. [ ] 첨부파일 업로드/다운로드 API
8. [ ] 다운로드 기록 조회 API
9. [ ] 접근제어 로직 (게시대상 + 사내회원 규칙)

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`content.design.md`)
2. [ ] Design 리뷰 후 구현 시작
3. [ ] 구현 완료 후 Gap Analysis

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
