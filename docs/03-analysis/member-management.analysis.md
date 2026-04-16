# member-management Gap Analysis Report

> **Feature**: 회원관리 (관리자)
> **Date**: 2026-04-16 (v1.3 — Chicago Code Review 반영)
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
| 4 | 2026-04-16 | v1.2 | 100% | Chicago 리뷰 반영 (화이트리스트 / NFKC 로그 / warnings 라벨화) |

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
| GENERAL | 전체 필드 | route.ts:245 (조건 제외) | O |
| STORE | newsRcptYn | route.ts:245-262 | O |
| SEKO | newsRcptYn | route.ts:245-262 | O |
| ADMIN | newsRcptYn | route.ts:245-262 | O |

**구현 방식 (Chicago 리뷰 반영, 2026-04-16):**
- 블랙리스트 → 화이트리스트 전환
- `ALLOWED_NON_GENERAL_FIELDS: ReadonlySet<keyof MemberUpdateInput>` 상수 (route.ts:33-35, `new Set(["newsRcptYn"])`)
- `Object.keys(result.data)` 전수 검사 → 화이트리스트 외 키는 `disallowedFields` 수집 → 400
- 이유: `memberUpdateSchema` 에 새 필드가 추가될 때 블랙리스트 갱신 누락 시 fail-open 되는 위험 제거. `ReadonlySet<keyof MemberUpdateInput>` 타이핑으로 스키마 리팩터링 시 컴파일러가 탐지.

### 2.2 탈퇴·삭제 STORE 차단 (v1.1)

| 조건 | 동작 | 구현 위치 | 일치 |
|------|------|----------|:----:|
| userTp=STORE + preDetail=null | 400 (storeLvl 확보 불가) | route.ts:268-277 | O |

### 2.3 본인 계정 보호 가드 — MF-4

| 조건 | 비교 방식 | 구현 위치 | 일치 |
|------|----------|----------|:----:|
| preDetail 존재 | canonical ID (isSelfTarget) | route.ts:315-322 | O |
| preDetail null | NFKC + 공백 제거 + toLowerCase | route.ts:327-343 | O |

**로그 조건 (Chicago 리뷰 반영, 2026-04-16):**
- NFKC 정규화 self-target 비교의 `console.warn` 은 **matched=true(차단 발동) 케이스에서만** 출력
- 불일치(정상 경로)는 로그 생략 → 운영 노이즈 제거, 감사 로그로써 의미만 유지

### 2.4 preDetail null + critical 변경 제한 (v1.2, PR #53 반영)

| 요청 필드 | 설계 정책 | 구현 위치 | 일치 |
|-----------|----------|----------|:----:|
| userRole | 400 차단 | route.ts:285, 287-300 | O |
| twoFactorEnabled | 400 차단 | route.ts:286, 287-300 | O |
| status=active | 허용 (복구) | route.ts:283 (조건 제외) | O |
| newsRcptYn/loginNotification/attributeChangeNotification | 허용 + warnings 통보 | route.ts:375-380 | O |

### 2.5 Fallback 통보 (warnings 배열, v1.2)

| QSP 필드 | 설계 통보 대상 | 일본어 라벨 (클라이언트 노출) | 구현 위치 | 일치 |
|----------|---------------|------------------------------|----------|:----:|
| secAuthYn | O | 二段階認証設定 | route.ts:375 | O |
| loginNotiYn | O | ログイン通知設定 | route.ts:376 | O |
| attrChgYn | O | 属性変更通知設定 | route.ts:377 | O |
| newsRcptYn | O | ニュースレター受信設定 | route.ts:378 | O |
| authCd | O | ユーザー権限 | route.ts:379 | O |
| statCd | O | アカウント状態 | route.ts:380 | O |

**라벨 매핑 (Chicago 리뷰 반영, 2026-04-16):**
- `DEFAULTED_FIELD_LABELS_JA: Record<string, string>` 상수 (route.ts:42-49) 로 QSP 내부 필드명을 일본어 라벨로 치환
- 응답 생성: `${DEFAULTED_FIELD_LABELS_JA[f] ?? f}が既定値で更新されました (元の値を取得できなかったため)` (route.ts:511-517)
- 매핑 누락 시 원시 필드명 폴백(defensive). 현재 6개 defaulted 키와 매핑 키는 1:1 완전 일치
- 이유: 클라이언트 응답에서 QSP 내부 필드명 노출 방지. 일본어 환경에 맞춘 표현 일관성 확보. 내부 `console.warn` / `changedFields` 감사 로그는 개발자 디버깅용이므로 원시 키 유지.

### 2.6 TOCTOU 사후 검증 — MF-6 (v1.1)

| 조건 | 동작 | 구현 위치 | 일치 |
|------|------|----------|:----:|
| userRole 변경 + 재조회 실패 | warning 필드 세팅 | route.ts:484-489 | O |
| userRole 변경 + postDetail.userTp != GENERAL | CRITICAL 로그 + warning | route.ts:490-496 | O |
| userRole 미변경 | 재조회 없음 | route.ts:482 | O |

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
| data.message | 필수 | 항상 포함 (route.ts:521) | O |
| data.warning | TOCTOU 실패/불일치 시만 | 조건부 spread (route.ts:522) | O |
| data.warnings | defaulted 필드 있을 시만 | 조건부 spread (route.ts:523) | O |

### 3.2 에러 응답 매트릭스

| Status | 설계 v1.2 사유 | 구현 | 일치 |
|--------|----------------|------|:----:|
| 400 ① | 입력 검증 실패 (Zod) | route.ts:201-219 | O |
| 400 ② | 권한별 수정 제한 위반 | route.ts:245-262 | O |
| 400 ③ | 탈퇴·삭제 STORE 차단 | route.ts:268-277 | O |
| 400 ④ | 본인 계정 critical 변경 차단 | route.ts:315-343 | O |
| 400 ⑤ | userRole 대상 회원 비일반 | route.ts:347-354 | O |
| 400 ⑥ | userTp 파라미터 누락/형식 오류 | route.ts:222-229 | O |
| 400 ⑦ (v1.2) | preDetail null + userRole/twoFactorEnabled 차단 | route.ts:283-301 | O |
| 401 | 인증 필요 | requireAdmin | O |
| 403 | 관리자 권한 없음 | requireAdmin | O |
| 500 | 서버 내부 오류 | route.ts:531-534 | O |
| 502 | QSP 외부 서버 오류 / 스키마 불일치 / resultCode != "S" | route.ts:426-475 | O |

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

### 6.1 1차 반영 (C1/C2/C3)

| 리뷰 건 | 분류 | 반영 위치 | 상태 |
|---------|------|----------|:----:|
| C1: self-guard fallback 닫기 (NFKC) | Critical | route.ts:327-343 | ✅ |
| C2: preDetail null + userRole fail-closed | Critical | route.ts:283-301 | ✅ |
| C3: defaulted 필드 warnings 통보 | Critical | route.ts:369-384, 511-517 | ✅ |
| I4: userListMng 주석 정정 | Important | route.ts:267-269 | ✅ |
| Design v1.1 → v1.2 업데이트 | — | design.md | ✅ |
| OpenAPI warnings 필드 추가 | — | openapi.ts:2294-2299 | ✅ |

### 6.2 Chicago Code Review 반영 (2026-04-16)

| 리뷰 건 | 분류 | 반영 위치 | 상태 |
|---------|------|----------|:----:|
| H1: 블랙리스트 → 화이트리스트 전환 | HIGH | route.ts:33-35, 248-262 | ✅ |
| M1: NFKC self-target warn 로그 노이즈 감소 | MEDIUM | route.ts:327-343 (matched=true 시에만 출력) | ✅ |
| M2: warnings 응답 QSP 내부 필드명 → 일본어 라벨 | MEDIUM | route.ts:42-49, 511-517 | ✅ |
| Design v1.2 Response 예시 라벨 동기화 | — | design.md §1.4 | ✅ |

### 6.3 Next-sprint 후보 (본 PR 범위 외)

- `normalize()` 인라인 함수를 모듈 유틸(`src/lib/text.ts` 등)로 추출
- `rawId` 빈 문자열 경계값 방어 (현재는 Zod `.min(1)` 이 우회 불가 보장)
- QSP 원자적 업데이트 조건(`expectedUserTp=GENERAL`) 추가 요청 (QSP 측 변경 필요)

---

## 7. 점수 산출 (v1.2 기준 + Chicago 리뷰 반영)

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
| PR #53 1차 리뷰 반영 | 6 | 6/6 |
| Chicago 리뷰 반영 | 4 | 4/4 |
| **합계** | **118** | **118/118** |

**Match Rate: 118/118 = 100%**

---

## 8. 비차단(non-blocking) 개선 제안

gap-detector / Chicago 리뷰가 발견한 개선 여지 (gap 아님, 후속 이슈로 트래킹):

1. **ZWSP 등 invisible char 처리 엄격화** (route.ts:327-328)
   - 현재 `\s+` 는 ECMAScript 표준 whitespace 만 매칭. ZWSP(U+200B), ZWNJ(U+200C) 등은 NFKC 로 완전 제거되지 않을 수 있음
   - 필요 시 `.replace(/[\s\u200B-\u200D\uFEFF]/g, "")` 로 확장 고려
   - 현재 범위로도 설계 §1.3 의도는 충족

2. **`normalize()` 인라인 함수 → 모듈 유틸 추출** (route.ts:327-328)
   - `src/lib/text.ts` 등으로 추출 시 재사용성 확보 (Chicago 리뷰 Craftsman)

3. **`rawId` 빈 문자열 경계값 가드** (route.ts 전반)
   - 현재 `memberIdParamSchema` 의 `.min(1)` 이 차단하므로 도달 불가 경로이나 방어 코드 추가 고려

4. **`DEFAULTED_FIELD_LABELS_JA` 타입 엄격화** (route.ts:42-49)
   - `Record<string, string>` → `Record<"secAuthYn" | "loginNotiYn" | ... , string>` 으로 좁히면 매핑 누락을 컴파일 타임에 탐지 가능 (`?? f` 폴백이 있어 런타임 안전은 이미 확보)

5. **QSP I/F 개선 요청 미해소** (후속 작업 — QSP 측 변경 필요)
   - `userListMng` 응답에 `storeLvl` / `newsRcptYn` 추가 (2026-04-16 요청 중)
   - `updateUserDtlMng` 원자적 조건 `expectedUserTp=GENERAL` 추가 (차후 요청)
   - 회신 후 4-0-b STORE 차단 해제 + 4-0-c fallback 확장 가능

---

## 9. 권장 다음 단계

Match Rate **100%** 달성 → `/pdca report member-management` 로 완료 보고서 생성 가능.

PR #53 커밋/push 는 별도 사용자 승인 대기 (feedback_ask_before_push 규칙).
