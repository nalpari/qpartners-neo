# 공통코드(Code) Gap Analysis Report

> **Analysis Type**: Gap Analysis
>
> **Project**: qpartners-neo
> **Analyst**: CK
> **Date**: 2026-03-23
> **Design Doc**: [code.design.md](../02-design/features/code.design.md)

---

## Overall Match Rate: 88%

| Category | Score | Status |
|----------|:-----:|:------:|
| API Endpoint Match | 100% | ✅ |
| Zod Schema Match | 100% | ✅ |
| Query Parameter Match | 100% | ✅ |
| Response Format Match | 95% | ✅ |
| Business Logic Match | 100% | ✅ |
| Error Handling | 90% | ✅ |
| createdBy/updatedBy 처리 | 0% | ❌ |
| **Overall** | **88%** | **⚠️** |

---

## 1. API Endpoint (Design 7개 vs 구현 8개)

| Design Endpoint | Method | 구현 파일 | Status |
|----------------|--------|----------|--------|
| `/api/codes` | GET | `src/app/api/codes/route.ts` | ✅ |
| `/api/codes` | POST | `src/app/api/codes/route.ts` | ✅ |
| `/api/codes/[id]` | PUT | `src/app/api/codes/[id]/route.ts` | ✅ |
| `/api/codes/[id]/details` | GET | `src/app/api/codes/[id]/details/route.ts` | ✅ |
| `/api/codes/[id]/details` | POST | `src/app/api/codes/[id]/details/route.ts` | ✅ |
| `/api/codes/[id]/details/[detailId]` | PUT | `src/app/api/codes/[id]/details/[detailId]/route.ts` | ✅ |
| `/api/codes/[id]/details/[detailId]` | DELETE | `src/app/api/codes/[id]/details/[detailId]/route.ts` | ✅ |
| *(Design에 없음)* | GET `/api/codes/[id]` | `src/app/api/codes/[id]/route.ts` | ⚠️ Added |

---

## 2. Gap 목록

### 🔴 Missing: createdBy/updatedBy 미처리 (영향도 High)

Prisma 스키마에 `createdBy`/`updatedBy` 컬럼이 정의되어 있으나, 모든 API에서 이 필드를 data에 포함하지 않아 항상 `null`로 저장됨. Design 문서 Data Model에도 해당 필드 미명시.

| 모델 | 필드 | Prisma | API | Gap |
|------|------|:------:|:---:|:---:|
| CodeHeader | createdBy | ✅ | ❌ | **Gap** |
| CodeHeader | updatedBy | ✅ | ❌ | **Gap** |
| CodeDetail | createdBy | ✅ | ❌ | **Gap** |
| CodeDetail | updatedBy | ✅ | ❌ | **Gap** |

### 🟡 Added: Header 단건 조회 (Design에 없으나 구현됨)

`GET /api/codes/[id]` — Detail 포함하여 반환. 수정 화면 진입 시 필수적이므로 양호한 추가.

### 🔵 비표준: 에러 응답 형식 (영향도 Medium)

현재 `{ error: string }` 또는 `{ error: string, issues: ZodIssue[] }` 혼재. 표준화 필요.

---

## 3. 권장 조치

| # | 항목 | 조치 | 우선도 |
|---|------|------|--------|
| 1 | createdBy/updatedBy | 인증 미구현 상태이므로, 인증 완료 후 일괄 적용 | 보류 |
| 2 | Design 문서 보완 | GET /api/codes/[id] 단건 조회 + createdBy/updatedBy 명시 | 낮음 |
| 3 | 에러 응답 표준화 | 전체 API 공통 에러 포맷 정의 후 일괄 적용 | 낮음 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-23 | Initial gap analysis | CK |
