# password-reset Gap Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
> **Project**: qpartners-neo
> **Date**: 2026-04-01
> **Match Rate**: 96% (Iter 2, prev: 82%)
> **Design Doc**: [password-reset.design.md](../02-design/features/password-reset.design.md)

---

## 1. 전체 점수

| 카테고리 | 점수 | 상태 |
|---------|------|------|
| API 엔드포인트 | 90% | ✅ 양호 |
| 데이터 모델/스키마 | 88% | ✅ 양호 |
| 프론트엔드 UI | 65% | ⚠️ 주의 |
| 메일 발송 | 95% | ✅ 양호 |
| 환경변수 | 100% | ✅ 완전 일치 |
| 미들웨어 | 100% | ✅ 완전 일치 |
| OpenAPI 문서 | 95% | ✅ 양호 |

---

## 2. 누락 기능 (설계 O, 구현 X)

| # | 항목 | 영향도 | 설명 |
|---|------|--------|------|
| 1 | /password-reset 랜딩 페이지 | Critical | 메일 링크 클릭 시 비밀번호 변경 UI 필요 (설계 p.13) |
| 2 | 시공점 sekoId 입력 필드 | High | 팝업 installer 탭에 sekoId 필드 없음 |
| 3 | 일반회원 폼 불일치 | High | 설계: ID(이메일) 1필드, 구현: E-Mail+氏名 2필드 |
| 4 | email/check API | High | POST /api/auth/email/check 미구현 |
| 5 | Zod 조건부 필수 검증 | Medium | loginId(DEALER), sekoId(SEKO) 조건부 필수 미적용 |
| 6 | verify 응답 userId | Low | 설계: userId 포함, 구현: 미포함 (보안상 합리적) |

---

## 3. 변경 기능 (설계 != 구현)

| # | 항목 | 설계 | 구현 | 영향도 |
|---|------|------|------|--------|
| 1 | verify 응답 필드명 | userTp | userType | Low |
| 2 | 메일 제목 | 일본어만 | 일본어+한국어 | Low (개선) |

---

## 4. 긍정적 초과 구현 (설계 X, 구현 O)

| # | 항목 | 설명 |
|---|------|------|
| 1 | Rate Limiting | 동일 이메일 시간당 3건 제한 |
| 2 | 기존 토큰 무효화 | 새 요청 시 이전 토큰 자동 만료 |
| 3 | TOCTOU 방지 | updateMany 원자적 토큰 소비 |
| 4 | 토큰 롤백 | QSP 실패 시 토큰 재사용 가능 복원 |
| 5 | XSS 방지 | 메일 템플릿 escapeHtml 적용 |

---

## 5. 권장 조치

### 즉시 (Critical)
1. `/password-reset` 페이지 구현 (메일 링크 랜딩)
2. 시공점 sekoId 필드 추가

### 단기 (High)
3. 일반회원 폼 설계 동기화 (氏名 제거 or 설계 반영)
4. email/check API 구현
5. Zod superRefine 조건부 필수 추가

### 설계 문서 갱신
- verify 응답 필드, Rate Limiting, 토큰 롤백 등 반영

---

## Iteration 2 수정 내역

| # | Gap | 조치 |
|---|-----|------|
| 1 | /password-reset 랜딩 페이지 미구현 | ✅ 신규 생성 (page.tsx + client.tsx) |
| 2 | 일반회원 폼 氏名 제거 | ✅ ID(E-Mail) 1필드로 변경 |
| 3 | Zod 조건부 필수 미적용 | ✅ DEALER loginId superRefine 추가 |
| 4 | email/check API | ✅ 이미 존재 확인 (이전 분석 오류) |

## 남은 Gap (선택)

| # | 항목 | 심각도 | 비고 |
|---|------|--------|------|
| 1 | 시공점 sekoId 필드 누락 | Medium | 현업 확인 후 결정 |
| 2 | verify 응답 필드명 차이 | Low | 설계 문서 갱신 권장 |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-04-01 | Initial gap analysis (82%) |
| 0.2 | 2026-04-01 | Iteration 2 re-analysis (96%) |
