# member-management Gap Analysis Report

> **Feature**: 회원관리 (관리자)
> **Date**: 2026-04-03
> **Plan**: [member-management.plan.md](../01-plan/features/member-management.plan.md)
> **Design**: [member-management.design.md](../02-design/features/member-management.design.md)

---

## Match Rate: 95%

```
[Plan] -> [Design] -> [Do] -> [Check 95%] -> [Act] ⏳
```

---

## 1. 요구사항(FR) 구현 현황

| ID | 요구사항 | 구현 | 비고 |
|----|----------|:----:|------|
| FR-01 | 시공점 제외 목록 표시 | O | QSP API에 위임 (accsSiteCd=QPARTNERS) |
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

## 2. API 스펙 일치

| 엔드포인트 | Method | 설계 | 구현 | 일치 |
|-----------|--------|:----:|:----:|:----:|
| /api/admin/members | GET | O | O | O |
| /api/admin/members/:id | GET | O | O | O |
| /api/admin/members/:id | PUT | O | O | O |
| /api/admin/members/:id/reset-password | POST | O | O | O |

**상세 응답 필드: 29/29 일치 (100%)**
**수정 가능 항목: 6/6 일치 (100%)**

---

## 3. 컨벤션 준수

| 규칙 | 준수 | 비고 |
|------|:----:|------|
| Route Handler 최상위 try-catch | O | 전체 6개 핸들러 |
| Zod 스키마 입력값 검증 | O | memberListQuerySchema, memberUpdateSchema 등 |
| API 로그 한글, 유저 메시지 일본어 | O | |
| as 타입 캐스팅 금지 | O | userTpSchema.safeParse 사용 |
| PII 로깅 금지 | O | userId/이메일 로그 직접 노출 제거 완료 |
| catch (error: unknown) | O | 전체 catch 블록 |
| OpenAPI 스펙 동기화 | O | Member 태그 + 3개 스키마 |

---

## 4. 의도적 변경 사항

| 항목 | 설계 | 구현 | 사유 |
|------|------|------|------|
| 비번초기화 응답 message | 한국어 | 일본어 | 컨벤션 (유저 메시지=일본어) |
| MemberDetail id 타입 | integer | string | QSP 외부 API에서 numeric id 미제공, userId 사용 |
| 목록 userType 값 | 코드값 (GENERAL) | 일본어 레이블 (一般) | 프론트 편의 |

---

## 5. 점수 산출

| 검사 영역 | 항목 | 일치 |
|-----------|------|------|
| 요구사항 (FR) | 13 | 13/13 |
| 엔드포인트 | 4 | 4/4 |
| 쿼리 파라미터 | 5 | 5/5 |
| 상세 응답 필드 | 29 | 29/29 |
| 수정 가능 필드 | 6 | 6/6 |
| 파일 구조 | 4 | 4/4 |
| 컨벤션 (7항목) | 7 | 7/7 |
| 응답 매핑 방식 | 3 | 2/3 |
| **합계** | **71** | **68/71** |

**Match Rate: 68/71 = 95.8% → 반올림 95%**

---

## 6. 권장 다음 단계

Match Rate >= 90% 달성 → `/pdca report member-management`로 완료 보고서 생성 가능
