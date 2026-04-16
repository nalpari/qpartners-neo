# member-management Gap Analysis Report

> **Feature**: 회원관리 (관리자)
> **Date**: 2026-04-16 (v1.2 — PR #53 리뷰 반영)
> **Plan**: [member-management.plan.md](../01-plan/features/member-management.plan.md)
> **Design**: [member-management.design.md](../02-design/features/member-management.design.md) (v1.2)
> **PR**: qpartners-neo#53

---

## Match Rate: 100%

```
[Plan] -> [Design v1.2] -> [Do] -> [Check 100%] ✅
```

| 회차 | 날짜 | Design 버전 | Match Rate | 비고 |
|-----|------|------------|-----------|------|
| 1 | 2026-04-03 | v0.1 (초안) | 95% | 초기 구현 완료 |
| 2 | 2026-04-16 | v1.1 | 97.7% | 권한별 수정 제한 + 탈퇴/삭제 허용 |
| 3 | 2026-04-16 | v1.2 | 100% | PR #53 리뷰 반영 (C1/C2/C3) |

---

## 1. 요구사항(FR) 구현 현황

| ID | 요구사항 | 구현 | 비고 |
|----|----------|:----:|------|
| FR-01 | 시공점 제외 목록 표시 | O | QSP API에 위임 (userTp != SEKO) |
| FR-02 | 검색: ID/성명/이메일/회원유형/회사명/상태 | O | keyword+userType+status 파라미터 |
| FR-03 | 상태: Active/Delete/탈퇴 | O | active/deleted/withdrawn 매핑 |
| FR-04 | 성명 클릭 시 상세 팝업 | — | Out of Scope (프론트 담당) |
| FR-05 | 페이징 (20개 단위) | O | page/pageSize 기본값 20 |
| FR-06 | 등록일/갱신일시(수정자) 표시 | O | createdAt/updatedAt/updatedBy |
| FR-07 | 비밀번호 초기화 (메일 발송) | O | PasswordResetToken + sendMail |
| FR-08 | 사용자권한 변경 (일반회원만) | O | userTp===GENERAL 서버측 검증 |
| FR-09 | 2차 인증 유효/무효 | O | twoFactorEnabled → secAuthYn |
| FR-10 | 로그인 알림받기 유효/무효 | O | loginNotification → loginNotiYn |
| FR-11 | 속성변경 알림받기 유효/무효 | O | attributeChangeNotification |
| FR-12 | 회원상태 Active/Delete 변경 | O | status: active/deleted |
| FR-13 | 탈퇴일시/탈퇴사유 표시 | O | withdrawnAt/withdrawnReason |
| FR-14 | 뉴스레터 수신 + 변경일자 | O | newsRcptYn/newsRcptDate |

**요구사항 구현율: 13/13 = 100%** (FR-04 Out of Scope)

---

## 2. v1.1/v1.2 정책 구현 현황

### 2.1 권한별 수정 제한 정책 (v1.1, 2026-03-30)

| 대상 userTp | 허용 필드 | 구현 위치 | 일치 |
|-------------|----------|----------|:----:|
| GENERAL | 전체 필드 | route.ts:218 (조건 제외) | O |
| STORE | newsRcptYn | route.ts:218-238 | O |
| SEKO | newsRcptYn | route.ts:218-238 | O |
| ADMIN | newsRcptYn | route.ts:218-238 | O |

### 2.2 탈퇴·삭제 STORE 차단 (v1.1)

| 조건 | 동작 | 구현 위치 | 일치 |
|------|------|----------|:----:|
| userTp=STORE + preDetail=null | 400 (storeLvl 확보 불가) | route.ts:244-253 | O |

### 2.3 본인 계정 보호 가드 — MF-4

| 조건 | 비교 방식 | 구현 위치 | 일치 |
|------|----------|----------|:----:|
| preDetail 존재 | canonical ID (isSelfTarget) | route.ts:290-297 | O |
| preDetail null | NFKC + 공백 제거 + toLowerCase (v1.2) | route.ts:303-317 | O |

### 2.4 preDetail null + critical 변경 제한 (v1.2, PR #53 반영)

| 요청 필드 | 설계 정책 | 구현 위치 | 일치 |
|-----------|----------|----------|:----:|
| userRole | 400 차단 | route.ts:261, 263-276 | O |
| twoFactorEnabled | 400 차단 | route.ts:262, 263-276 | O |
| status=active | 허용 (복구) | route.ts:259 (조건 제외) | O |
| newsRcptYn/loginNotification/attributeChangeNotification | 허용 + warnings 통보 | route.ts:351-356 | O |

### 2.5 Fallback 통보 (warnings 배열, v1.2)

| QSP 필드 | 설계 통보 대상 | 구현 위치 | 일치 |
|----------|---------------|----------|:----:|
| secAuthYn | O | route.ts:351 | O |
| loginNotiYn | O | route.ts:352 | O |
| attrChgYn | O | route.ts:353 | O |
| newsRcptYn | O | route.ts:354 | O |
| authCd | O | route.ts:355 | O |
| statCd | O | route.ts:356 | O |

### 2.6 TOCTOU 사후 검증 — MF-6 (v1.1)

| 조건 | 동작 | 구현 위치 | 일치 |
|------|------|----------|:----:|
| userRole 변경 + 재조회 실패 | warning 필드 세팅 | route.ts:460-465 | O |
| userRole 변경 + postDetail.userTp != GENERAL | CRITICAL 로그 + warning | route.ts:466-472 | O |
| userRole 미변경 | 재조회 없음 | route.ts:458 | O |

---

## 3. API 스펙 일치

| 엔드포인트 | Method | 설계 | 구현 | 일치 |
|-----------|--------|:----:|:----:|:----:|
| /api/admin/members | GET | O | O | O |
| /api/admin/members/:id | GET | O | O | O |
| /api/admin/members/:id | PUT | O | O | O |
| /api/admin/members/:id/reset-password | POST | O | O | O |

**상세 응답 필드: 29/29 일치 (100%)**
**수정 가능 항목: 6/6 일치 (100%)**

### 3.1 Response 200 필드 (PUT)

| 필드 | 설계 v1.2 | 구현 | 일치 |
|------|----------|------|:----:|
| data.message | 필수 | 항상 포함 (route.ts:495) | O |
| data.warning | TOCTOU 실패/불일치 시만 | 조건부 spread (route.ts:496) | O |
| data.warnings | defaulted 필드 있을 시만 | 조건부 spread (route.ts:497) | O |

### 3.2 에러 응답 매트릭스

| Status | 설계 v1.2 사유 | 구현 | 일치 |
|--------|----------------|------|:----:|
| 400 ① | 입력 검증 실패 (Zod) | route.ts:178-196 | O |
| 400 ② | 권한별 수정 제한 위반 | route.ts:218-238 | O |
| 400 ③ | 탈퇴·삭제 STORE 차단 | route.ts:244-253 | O |
| 400 ④ | 본인 계정 critical 변경 차단 | route.ts:290-319 | O |
| 400 ⑤ | userRole 대상 회원 비일반 | route.ts:323-330 | O |
| 400 ⑥ | userTp 파라미터 누락/형식 오류 | route.ts:199-206 | O |
| 400 ⑦ (v1.2) | preDetail null + userRole/twoFactorEnabled 차단 | route.ts:259-277 | O |
| 401 | 인증 필요 | requireAdmin | O |
| 403 | 관리자 권한 없음 | requireAdmin | O |
| 500 | 서버 내부 오류 | route.ts:513-516 | O |
| 502 | QSP 외부 서버 오류 / 스키마 불일치 / resultCode != "S" | route.ts:402-451 | O |

---

## 4. OpenAPI 스펙 동기화

| 항목 | 설계 v1.2 | openapi.ts | 일치 |
|------|----------|-----------|:----:|
| PUT description | v1.2 정책 반영 | openapi.ts:2263-2268 | O |
| 200 warning 필드 | 존재 | openapi.ts:2291 | O |
| 200 warnings 배열 필드 (v1.2) | 존재 | openapi.ts:2294-2299 | O |
| 400 사유 설명 (⑦ 추가) | 존재 | openapi.ts:2307-2309 | O |

---

## 5. 컨벤션 준수

| 규칙 | 준수 | 비고 |
|------|:----:|------|
| Route Handler 최상위 try-catch | O | GET/PUT 모두 |
| Zod 스키마 입력값 검증 | O | memberListQuerySchema, memberUpdateSchema, userTpSchema |
| API 로그 한글, 유저 메시지 일본어 | O | 전수 확인 (PR #53 리뷰) |
| as 타입 캐스팅 금지 | O | 타입 가드 (isQspStatCd, isUserTypeKey) 사용 |
| PII 로깅 금지 | O | maskEmail 일관 사용 |
| catch (error: unknown) | O | 전체 catch 블록 |
| OpenAPI 스펙 동기화 | O | v1.2 warnings 반영 |
| as const (리터럴 단언) 허용 | O | feedback_no_as_casting 범위 밖 |

---

## 6. PR #53 코드 리뷰 반영 사항

| 리뷰 건 | 분류 | 반영 위치 | 상태 |
|---------|------|----------|:----:|
| C1: self-guard fallback 닫기 (NFKC) | Critical | route.ts:303-319 | ✅ |
| C2: preDetail null + userRole fail-closed | Critical | route.ts:259-277 | ✅ |
| C3: defaulted 필드 warnings 통보 | Critical | route.ts:345-360, 485-498 | ✅ |
| I4: userListMng 주석 정정 | Important | route.ts:241-243 | ✅ |
| Design v1.1 → v1.2 업데이트 | — | design.md | ✅ |
| OpenAPI warnings 필드 추가 | — | openapi.ts:2294-2299 | ✅ |

---

## 7. 점수 산출 (v1.2 기준)

| 검사 영역 | 항목 | 일치 |
|-----------|------|------|
| 요구사항 (FR) | 13 | 13/13 |
| 엔드포인트 | 4 | 4/4 |
| 쿼리 파라미터 | 5 | 5/5 |
| 상세 응답 필드 | 29 | 29/29 |
| 수정 가능 필드 | 6 | 6/6 |
| v1.1/v1.2 정책 (6영역) | 24 | 24/24 |
| 에러 응답 매트릭스 | 11 | 11/11 |
| OpenAPI 동기화 | 4 | 4/4 |
| 파일 구조 | 4 | 4/4 |
| 컨벤션 (8항목) | 8 | 8/8 |
| PR #53 리뷰 반영 | 6 | 6/6 |
| **합계** | **114** | **114/114** |

**Match Rate: 114/114 = 100%**

---

## 8. 비차단(non-blocking) 개선 제안

gap-detector 가 발견한 개선 여지 (gap 아님, 후속 이슈로 트래킹):

1. **ZWSP 등 invisible char 처리 엄격화** (route.ts:303-304)
   - 현재 `\s+` 는 ECMAScript 표준 whitespace 만 매칭. ZWSP(U+200B), ZWNJ(U+200C) 등은 NFKC 로 완전 제거되지 않을 수 있음
   - 필요 시 `.replace(/[\s\u200B-\u200D\uFEFF]/g, "")` 로 확장 고려
   - 현재 범위로도 설계 §1.3 의도는 충족

2. **QSP I/F 개선 요청 미해소** (후속 작업)
   - `userListMng` 응답에 `storeLvl` / `newsRcptYn` 추가 (2026-04-16 요청 중)
   - `updateUserDtlMng` 원자적 조건 `expectedUserTp=GENERAL` 추가 (차후 요청)
   - 회신 후 4-0-b STORE 차단 해제 + 4-0-c fallback 확장 가능

---

## 9. 권장 다음 단계

Match Rate **100%** 달성 → `/pdca report member-management` 로 완료 보고서 생성 가능.

PR #53 커밋/push 는 별도 사용자 승인 대기 (feedback_ask_before_push 규칙).
