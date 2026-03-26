# 일반 회원가입 API Planning Document

> **Summary**: QSP 일반 회원가입 I/F 프록시 API + 이메일 중복체크 + 가입완료 메일 발송
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-26
> **Status**: Draft
> **화면설계서**: p.16 (회원가입), p.17 (우편번호검색), p.18 (가입완료 팝업), p.19 (승인완료 메일)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 일반 회원이 Q.PARTNERS에 직접 가입할 수 있는 수단이 없음 |
| **Solution** | QSP 회원가입 I/F(`newUserReq`)를 프록시하는 API + 이메일 중복체크 + 가입완료 메일 |
| **Function/UX Effect** | 회원정보 입력 → 이메일 중복체크 → 회원등록 → 완료 팝업 → 승인완료 메일 |
| **Core Value** | 셀프서비스 회원가입, QSP 마스터 연동 |

---

## 1. Overview

### 1.1 Purpose
일반 회원(GENERAL)이 Q.PARTNERS에 직접 가입할 수 있는 API 제공.
프론트에서 수집한 회원정보를 QSP `newUserReq` I/F로 전달하고, 가입 성공 시 승인완료 메일을 발송한다.

### 1.2 Background
- 사용자 마스터는 QSP 측 관리 (TO-BE DB에 저장하지 않음)
- QSP I/F #5: `POST /api/qpartners/user/newUserReq` (정의서작업완료)
- 판매점/시공점은 외부 사이트에서 별도 가입 (hanasys.jp / q-partners.q-cells.jp/seminar)
- 이메일 = 로그인 ID (일반회원)
- 가입경로코드(`joinSourceCd`) 필드 추가 (Redmine #1768, 2026-03-23)

### 1.3 회원유형별 가입 경로

| 유형 | 가입 방법 | 이 Plan 대상 |
|------|----------|:----:|
| 일반회원 (GENERAL) | Q.PARTNERS 직접 가입 | **Y** |
| 판매점 (DEALER) | 외부: https://www.hanasys.jp/join | N |
| 시공점 (SEKO) | 외부: https://q-partners.q-cells.jp/seminar/ | N |

---

## 2. Scope

### 2.1 In Scope
- [ ] 일반 회원가입 API (QSP `newUserReq` 프록시)
- [ ] 이메일 중복체크 API (QSP I/F 또는 자체 검증)
- [ ] 가입완료 승인 메일 발송 (nodemailer)
- [ ] Zod 입력 검증 스키마
- [ ] 비밀번호 정책 검증 (영문/숫자/기호 중 2종 이상, 8자 이상)

### 2.2 Out of Scope
- 회원가입 프론트 UI (프론트 담당)
- 이용약관 팝업 (프론트 담당)
- 판매점/시공점 가입 (외부 사이트)
- 관리자 가입 (별도 프로세스)
- 우편번호 검색 (프론트에서 zipcloud API 직접 호출 — AS-IS도 프론트 전용 AjaxZip3 사용)

---

## 3. Requirements

### 3.1 회원가입 (화면설계서 p.16)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-01 | 이메일 중복체크 (OK/FAIL 응답) | High | p.16 #2, #2-1 |
| FR-02 | 필수항목 전부 입력 시 회원등록 버튼 활성화 | High | p.16 #5 (프론트) |
| FR-03 | 확인 컨펌: "Q.PARTNERS 일반회원으로 가입하시겠습니까?" | Medium | p.16 #5 (프론트) |
| FR-04 | 비밀번호 정책: 영문/숫자/기호 중 2가지 이상, 8자 이상 | High | p.16 |
| FR-05 | 비밀번호 재입력 일치 확인 | High | p.16 (프론트+서버) |
| FR-06 | 뉴스레터 수신 여부 (허용/거부) | High | p.16 #7 (Redmine #1768) |
| FR-07 | 가입경로코드 전달 | High | QSP I/F `joinSourceCd` |
| FR-08 | 우편번호 검색 → 주소 자동완성 | Medium | p.17 |

### 3.2 가입 완료 (화면설계서 p.18)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-09 | 가입 성공 시 완료 팝업 표시 (성+이름, 이메일 표시) | Medium | p.18 (프론트) |
| FR-10 | 로그인 화면 이동 버튼 (일반회원탭 활성 + ID 자동입력) | Medium | p.18 #1 (프론트) |

### 3.3 승인완료 메일 (화면설계서 p.19)

| ID | Requirement | Priority | 화면설계서 |
|----|-------------|----------|-----------|
| FR-11 | 가입 성공 시 승인완료 메일 발송 | High | p.19 |
| FR-12 | 발신자: Q.PARTNERS事務局 <q-partners@hqj.co.jp> | High | p.19 |
| FR-13 | 일본어/한국어 이중 본문 | Medium | p.19 |
| FR-14 | 로그인 URL + 마이페이지 URL 포함 | High | p.19 |

---

## 4. API Endpoints

```
# 회원가입
POST   /api/auth/signup              → 일반 회원가입 (QSP newUserReq 프록시 + 메일 발송)

# 이메일 중복체크 (password-reset과 공용)
POST   /api/auth/email/check         → 이메일 사용 가능 여부
```

> **우편번호 검색**: 백엔드 API 없음. 프론트에서 zipcloud API 직접 호출.
> `https://zipcloud.ibsnet.co.jp/api/search?zipcode=1600022`
> AS-IS도 프론트 전용(AjaxZip3) 방식 사용.

---

## 5. QSP I/F Mapping

**QSP Endpoint**: `POST /api/qpartners/user/newUserReq`

### 프론트 입력 → QSP 필드 매핑

| 프론트 입력 | QSP 필드 | 필수 | 비고 |
|-------------|----------|:----:|------|
| (고정값) | userTp | Y | `"GENERAL"` 고정 |
| 이메일 (ID) | userId | Y | 이메일 = userId |
| 가입경로 | joinSourceCd | Y | 프론트에서 전달 (판매점경유/시공점경유 등) |
| 비밀번호 | pwd | Y | 비밀번호 정책 검증 후 전달 |
| 이름 | user1stNm | Y | |
| 성 | user2ndNm | Y | |
| 이름 카나 | user1stNmKana | Y | |
| 성 카나 | user2ndNmKana | Y | |
| 이메일 | email | Y | userId와 동일 |
| 부서명 | deptNm | N | |
| 직책 | pstnNm | N | |
| 회사명 | compNm | Y | |
| 회사명 카나 | compNmKana | Y | |
| 회사 우편번호 | compPostCd | Y | |
| 회사 주소 1 | compAddr | Y | |
| 회사 주소 2 | compAddr2 | Y | |
| 회사 전화번호 | compTelNo | Y | |
| 회사 Fax번호 | compFaxNo | N | |
| (고정값) | authCd | Y | `"NORMAL"` 고정 (일반회원 권한) |

### QSP 응답

```json
{
  "data": null,
  "result": {
    "code": 200,
    "message": "success",
    "resultCode": "S",
    "resultMsg": ""
  }
}
```

---

## 6. Process Flow

```
[Client — 회원가입 화면]
    │  필수항목 입력 + 이메일 중복체크 완료
    ▼
[POST /api/auth/signup]
    │  1. Zod 유효성 검증
    │  2. 비밀번호 정책 검증
    │  3. QSP newUserReq I/F 호출
    │  4. 성공 시 승인완료 메일 발송 (nodemailer)
    ▼
[Response → 프론트]
    │  성공: { data: { userName, email } }
    │  실패: { error: "..." }
    ▼
[프론트 — 가입완료 팝업]
    │  성+이름, 이메일 표시
    ▼
[로그인 화면 이동]
    │  일반회원탭 활성 + ID 자동입력
```

---

## 7. Dependencies / 확인 필요 사항

| 항목 | 상태 | Notes |
|------|------|-------|
| QSP newUserReq I/F | **정의서작업완료** | `POST /api/qpartners/user/newUserReq` |
| QSP 이메일 중복체크 I/F | **I/F 요청중** | password-reset과 공용 가능 |
| nodemailer | 설치 필요 | password-reset과 공용 (`src/lib/mailer.ts`) |
| 우편번호 검색 | ✅ **프론트 전용** | zipcloud API 직접 호출 (백엔드 불필요) — AS-IS도 AjaxZip3 프론트 전용 |
| joinSourceCd 값 | 확인 필요 | 일반회원 직접가입이므로 고정값 가능 — QSP 담당자에게 기본값 확인 |
| authCd 기본값 | 확인 필요 | 일반회원 기본 권한코드 (`"NORMAL"` 추정) |
| 뉴스레터 수신 여부 필드 | 확인 필요 | QSP I/F에 뉴스레터 필드 없음 — QSP 추가 or TO-BE DB 저장? |

---

## 8. Open Questions

1. **이메일 중복체크**: QSP 전용 I/F가 올 때까지 `newUserReq` 호출 시 에러 응답으로 판별 가능한가?
2. ~~우편번호 검색~~ → ✅ 프론트에서 zipcloud API 직접 호출로 결정
3. **뉴스레터 수신**: QSP I/F에 해당 필드 없음 — TO-BE DB(qp_info)에 별도 저장?
4. **joinSourceCd 값**: 일반회원 직접가입이므로 고정값 가능 — QSP 담당자에게 기본값 확인 (3번과 같이 문의)
5. **authCd 기본값**: 일반회원 `"NORMAL"` 맞는지 확인 필요

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-26 | Initial draft (QSP I/F 사양서 + 화면설계서 p.16-19 기반) | CK |
