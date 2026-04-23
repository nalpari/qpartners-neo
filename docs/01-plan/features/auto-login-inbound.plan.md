# 역방향 자동로그인 (외부 3사 → Q.Partners-neo) Planning Document

> **Summary**: HANASYS DESIGN / Q.Order / Q.Musubi 에서 Q.Partners-neo 로 유입 시, cipher 복호화 + QSP userDetail 조회 + Q.Partners-neo 자체 JWT 발급 방식으로 자동로그인 세션을 제공한다. 외부 3사 개발자용 가이드 문서 동봉.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-22
> **Status**: Implemented — 로컬 검증 완료, QSP 통합 검증은 dev 배포 후

## 설계 변경 이력 (2026-04-22 세션 내)

1. **초안**: AS-IS Q.Order 가이드 미러링 — cipher 복호화 후 내부 `/api/auth/login` 호출(`pwd` 자리에 `loginKey: "jpcellautologin!!"`).
2. **로컬 테스트에서 401** — QSP 가 `pwd="jpcellautologin!!"` 를 실제 pwd 로 간주하여 불일치 처리.
3. **QSP 사양서(v1.0) 재확인** — QSP Login API 파라미터에 `loginKey` 없음. AS-IS 가이드의 `jpcellautologin!!` 은 **AS-IS Q.Partners 레거시 자체 API** 동작이며, QSP 프록시 구조인 Q.Partners-neo 에는 그대로 적용 불가.
4. **재구현(현재 상태)**: cipher 소유 자체를 "외부 3사 인증 증명" 으로 간주 → Q.Partners-neo 가 QSP `userDetail` 로 메타데이터만 조회 후 **자체 JWT 서명·발급**. QSP 로그인 API 호출하지 않음.

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 자동로그인은 `Q.Partners → 외부 3사` 방향만 구현됨. 반대 방향(외부 3사 → Q.Partners-neo) 진입 시에는 수동 로그인 필요. |
| **Solution** | AS-IS Q.Order 가이드의 패턴을 그대로 반대로 적용 — 외부가 자체 cipher 생성 → Q.Partners-neo 진입 라우트 → 복호화 → 내부 로그인 API 호출(pwd 자리에 loginKey 상수) → 세션 발급. |
| **Function/UX Effect** | 외부 3사 사용자가 링크 클릭만으로 Q.Partners-neo에 자동 로그인. 실패 시 일반 로그인 페이지로 폴백. |
| **Core Value** | 3사 서비스간 seamless SSO 경험, 외부 개발자에게 가이드 문서 제공으로 통합 비용 절감. |

---

## 1. Overview

### 1.1 Purpose
HANASYS DESIGN / Q.Order / Q.Musubi의 로그인된 사용자가 Q.Partners-neo로 이동할 때 자동로그인되도록, 공개 진입 라우트 + 복호화 + 세션 발급 흐름을 구현하고, 3사 개발자에게 제공할 통합 가이드 문서를 작성한다.

### 1.2 Background
- **AS-IS (기존 구현)**: `feature/auto-login` 브랜치에 `Q.Partners → 외부 3사` 방향 자동로그인이 구현되어 있음
  - `src/lib/auto-login-crypto.ts` — AES-256-CBC 유틸 (`SHA-256(YYYYMMDD_KST + AUTO_LOGIN_AES_KEY)`로 키 파생)
  - `src/app/api/auth/auto-login/encrypt` (POST, 인증 필요)
  - `src/app/api/auth/auto-login/decrypt` (GET, PUBLIC)
- **공유받은 AS-IS Q.Order 가이드** (2026-04-22): cipher 생성 → QSP 경유 → QSP가 복호화 → **QSP가 Q.Partners의 `/api/qpartners/user/login` 호출 (pwd 자리에 `loginKey: "jpcellautologin!!"`)** → 세션 생성
- **TO-BE 요구사항**: 위 구조의 방향을 그대로 뒤집어 Q.Partners-neo가 수신측이 되도록 구현하고, 3사 개발자에게 가이드 문서 제공

### 1.3 Scope

#### In Scope
1. **진입 라우트**: 외부 3사가 `?autoLoginParam1=<cipher>`로 도달하는 공개 라우트 (복호화 → 내부 로그인 API 호출 → 홈 리다이렉트)
2. **`/api/auth/login` autoLogin 모드 추가**: `pwd` 필드가 `loginKey` 상수인 경우 QSP에 loginKey 전달 (QSP가 pwd 검증 스킵)
3. **폴백 UX**: 복호화 실패 / 로그인 실패 시 일반 로그인 페이지로 리다이렉트 + 사용자 안내 메시지
4. **외부 3사 개발자용 가이드 문서**: AS-IS Q.Order 가이드 구조 미러링 (암호화 발급/복호화/프로세스 다이어그램/체크리스트)
5. **feature/auto-login 자산 재사용**: `auto-login-crypto.ts` + encrypt/decrypt 라우트를 현 브랜치로 가져와 그대로 활용

#### Out of Scope
- 부가 파라미터(`returnUrl`, `expiresAt`, `userTp` 등) — cipher에는 **userId 단독**만 포함 (AS-IS Q.Order 가이드 방식). 추후 필요 시 확장.
- 3사별 사이트별 분리 키 — 현재는 AS-IS에서 쓰던 **공통 `AUTO_LOGIN_AES_KEY`** 그대로 재사용
- QSP 측 loginKey 모드 신규 구현 — AS-IS에서 이미 쓰이고 있는 구조이므로 그대로 성립 전제
- 사용자 매핑 테이블 — 외부 3사 사용자 ID = Q.Partners-neo `loginId`로 간주
- 자동로그인 관련 감사 로그 / 모니터링 대시보드

---

## 2. Current State Analysis

### 2.1 AS-IS 자동로그인 구조 (참조용)

```
┌───────────────┐   ① cipher 생성   ┌─────────┐   ② 리다이렉트(cipher)
│  Q.Partners   │ ────────────────→ │  QSP   │ ←─────────────── 브라우저
└───────────────┘                    └────┬────┘
                                          │ ③ 복호화 → userId
                                          │ ④ POST /api/qpartners/user/login
                                          │    { loginId, pwd: "jpcellautologin!!", userTp, ... }
                                          ↓
                                   ┌──────────────┐
                                   │  Q.Partners  │ ⑤ 세션 생성 → 홈
                                   └──────────────┘
```

**핵심 패턴**: 수신측(Q.Partners)이 자기 자신의 로그인 API를 호출. pwd 자리에 공유 시크릿(`loginKey`)을 세팅해서 pwd 검증 우회.

### 2.2 TO-BE 구조 (본 Plan이 구현할 것)

```
┌───────────────────────┐   ① cipher 생성      ┌──────────────────────┐
│ HANASYS/QOrder/QMusubi│ ───────────────────→ │  Q.Partners-neo      │
└───────────────────────┘                       │  진입 라우트         │
                                                │  (공개, 인증 불필요) │
                                                └─────────┬────────────┘
                                                          │ ② 복호화 → userId
                                                          │ ③ POST /api/auth/login
                                                          │    { loginId, pwd: LOGIN_KEY, userTp, ... }
                                                          │ ④ QSP에 loginKey 전달 → 세션 생성
                                                          ↓
                                                      홈 리다이렉트
```

### 2.3 재사용 가능한 자산 (`feature/auto-login` 브랜치)

| 파일 | 역할 | TO-BE 재사용 방식 |
|------|------|-------------------|
| `src/lib/auto-login-crypto.ts` | AES-256-CBC 암복호화 + KST 자정 경계 fallback | 그대로 재사용 (decrypt만 필요) |
| `src/app/api/auth/auto-login/decrypt/route.ts` | GET PUBLIC 복호화 엔드포인트 | 그대로 재사용 — 외부 3사도 테스트 시 참조 가능 |
| `src/app/api/auth/auto-login/encrypt/route.ts` | POST 인증 필요 암호화 엔드포인트 | 외부 3사가 cipher 자체 생성하므로 직접 필요 없음. 다만 테스트/디버깅용으로는 유지 |

### 2.4 AS-IS 로그인 경로 (`src/app/api/auth/login/route.ts`)

- 현재: `loginId + pwd + userTp`를 Zod 검증 → QSP `/login` 프록시 호출 → 응답 검증 → 2FA 판단 → JWT 쿠키 발급
- autoLogin 모드 추가 시 영향: `pwd === LOGIN_KEY` 분기 시 2FA 스킵 여부 확인 필요 (대개 스킵)

---

## 3. Implementation Plan

### Phase 1: 자산 이식 및 공통 상수 정의
1. `feature/auto-login` 브랜치에서 `auto-login-crypto.ts` + decrypt/encrypt 라우트를 신규 브랜치(`feature/auto-login-inbound`)로 cherry-pick
2. `src/lib/config.ts`에 `AUTO_LOGIN_KEY`(loginKey 상수) 추가 — AS-IS `jpcellautologin!!` 호환 혹은 신규 값 결정
3. 환경변수 `AUTO_LOGIN_AES_KEY`가 이미 설정되어 있다면 그대로 사용, 없으면 .env.example 업데이트 요청

### Phase 2: `/api/auth/login` autoLogin 모드 추가
1. `loginRequestSchema` 유지 — 모드 분기는 핸들러 내부에서
2. 요청 body의 `pwd === AUTO_LOGIN_KEY`이면 autoLogin 모드로 판정
3. QSP 호출 시 body는 그대로 `pwd` 필드에 loginKey 상수를 실어 보냄 (AS-IS와 동일)
4. autoLogin 모드에서는 2FA 로직 스킵 여부 결정 (기본: 스킵 — AS-IS 행동 미러링)
5. 로깅 시 pwd가 loginKey인 경우 별도 마스킹 (`[AUTO_LOGIN_KEY]`)

### Phase 3: 진입 라우트 구현
1. `src/app/api/auth/auto-login/inbound/route.ts` (GET) 신규 생성 — 또는 페이지 라우트 `/auto-login`
2. 흐름:
   - `autoLoginParam1` 쿼리 파라미터 수신 → `decodeURIComponent`
   - `auto-login-crypto.ts`의 `decryptAutoLoginId()` 호출 → userId 획득
   - 내부적으로 `/api/auth/login` POST 호출 (loginId=userId, pwd=AUTO_LOGIN_KEY, userTp=결정 필요)
   - 성공 시 JWT 쿠키 세팅된 채 홈(`/`)으로 리다이렉트
   - 실패 시 `/login?error=auto_login_failed`로 폴백
3. **userTp 결정 방식 확인 필요** — cipher에 포함하지 않으므로, Q.Partners-neo가 loginId만으로 userTp를 역추정해야 함. AS-IS 로그인은 userTp 필수. → Phase 3 착수 전 검증 필요 (QSP에 loginId 단독 조회 I/F가 있으면 해결, 없으면 cipher에 userTp 포함 재고려)
4. middleware.ts PUBLIC 경로 등록

### Phase 4: 외부 3사 개발자용 가이드 문서 작성
1. `docs/auto-login-inbound-guide.md` — 공유받은 Q.Order 가이드 구조 그대로 미러링:
   - 한눈에 보는 흐름
   - 핵심 키 정보 (`AUTO_LOGIN_AES_KEY` + 키 조합식)
   - 호출 URL 규격 (`https://{q-partners-neo-domain}/auto-login?autoLoginParam1=<cipher>`)
   - 서버 동작 상세 (encrypt/decrypt API 주소 — 테스트용)
   - 외부 사이트 구현 체크리스트
   - 프로세스 다이어그램 (Mermaid)
2. 언어: 한국어 (3사 개발자 한국어 가능 시) — 필요 시 일본어 번역본 추가

### Phase 5: 검증
1. 로컬에서 encrypt → 진입 라우트 왕복 테스트 (외부 요청 시뮬레이션)
2. QSP loginKey 모드 실제 동작 확인 (dev 배포 후)
3. 3사 개발자에게 가이드 전달 후 통합 테스트

---

## 4. Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| cipher 생성 주체 | **외부 3사 자체 생성** | AS-IS Q.Order/Q.Musubi 패턴 미러링. 3사에 API 토큰 발급/관리 부담 없음. |
| 암호화 규격 | AES-256-CBC + `SHA-256(YYYYMMDD_KST + AUTO_LOGIN_AES_KEY)` | AS-IS `auto-login-crypto.ts` 그대로 재사용 |
| 공통 키 전략 | 3사 공통 `AUTO_LOGIN_AES_KEY` | AS-IS에서 쓰던 키 재사용. 사이트별 분리 키는 추후 필요 시 도입 |
| cipher 내용 | **userId 단독** | AS-IS Q.Order 가이드 방식 미러링. 부가 파라미터는 필요 시 확장 |
| 세션 발급 경로 | **Q.Partners-neo 자체 JWT 발급** (QSP 로그인 API 미경유) | QSP v1.0 이 `loginKey` 파라미터 미지원. cipher 소유 = 인증 증명으로 간주하고 자체 JWT 서명. |
| QSP 호출 범위 | **`userDetail` (조회 전용)** 만 호출 | 사용자 메타데이터·권한(authCd, storeLvl) 확보 목적. 비밀번호 검증 불필요. |
| 2FA 정책 | autoLogin 진입 시 **스킵** (`twoFactorVerified: true` 로 발급) | 외부 3사 SSO 경유 인증 사용자에게 2FA 재요구는 UX 파괴. |
| 진입 라우트 위치 | `/api/auth/auto-login/inbound` (API Route, GET) | `NextResponse.redirect + cookies.set` 으로 쿠키 설정·리다이렉트 단일 응답 처리. 페이지 라우트 불필요. |
| userTp 전달 방식 | URL 쿼리 파라미터 (`&userTp=<TYPE>`) | cipher 는 userId 단독 유지. QSP userDetail 이 userTp 필수라 쿼리로 전달. 변조 시 QSP 조회 실패로 차단. |

---

## 5. Dependencies

| Item | Status | Impact |
|------|--------|--------|
| `feature/auto-login` 브랜치 자산 | ⏳ development 머지 여부 확인 필요 | cherry-pick 소요 |
| `AUTO_LOGIN_AES_KEY` 환경변수 | ✅ AS-IS 기준 `_autoL!!` 사용 중 | 3사와 키 공유 합의 필요 |
| QSP loginKey 모드 | ⏳ AS-IS에서 동작한다는 전제만 있음 | 실제 동작 확인은 dev 배포 후 |
| userTp 결정 경로 | ⏳ QSP I/F 파악 필요 | Phase 3 착수 전 확정 |
| pr-72 PR 정리 | ⏳ 대기 중 | 착수 블로커 |

---

## 6. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| QSP가 loginKey 모드를 지원하지 않음 | High | AS-IS에서 이미 쓰이고 있는 구조라는 전제. dev 배포 후 즉시 확인, 미지원 시 QSP팀과 협의 |
| userTp를 cipher 없이 결정 불가 | Medium | loginId 단독 조회 I/F가 QSP에 없으면 cipher에 userTp 포함으로 설계 변경 |
| 자정 경계 복호화 실패 | Low | AS-IS `auto-login-crypto.ts`에 fallback 이미 구현됨 |
| 외부 3사의 URL 인코딩 누락 | Medium | 가이드 문서에 `encodeURIComponent` 강조, 진입 라우트에서 decodeURIComponent 후 복호화 |
| 재전송 공격 (cipher 탈취 후 재사용) | Medium | loginKey 공유 시크릿 + 날짜 기반 키 파생으로 1일 유효. 필요 시 cipher에 `expiresAt`/`nonce` 포함하는 확장 가능 |
| 사용자 매핑 불일치 (외부 3사 ID ≠ Q.Partners loginId) | Medium | 현재는 동일하다고 가정. 불일치 사례 발견 시 매핑 테이블 신설 |

---

## 7. References

- `docs/01-plan/features/interface-log.plan.md` — Plan 문서 포맷 참조
- AS-IS Q.Order 자동로그인 가이드 (2026-04-22 공유받음, 본 Plan의 주요 미러링 대상)
- `feature/auto-login` 브랜치 커밋 이력:
  - `f36f0b9` feat: 자동로그인(hanasys/qOrder/qMusubi) 암복호화 API 구현
  - `8902997` fix: 자동로그인 Boston 리뷰 CRITICAL/HIGH 반영
- 관련 메모리:
  - `project_auto_login_flow.md` — AS-IS outbound 방향 구현 현황
  - `project_next_work_auto_login_inbound.md` — 본 Plan과 쌍을 이루는 내부 기록
  - `feedback_mirror_existing_patterns.md` — AS-IS 패턴 미러링 원칙
