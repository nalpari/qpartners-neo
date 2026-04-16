# 회원관리 (관리자) Design Document

> **Summary**: 관리자용 회원 목록/상세 조회·수정 + 비밀번호 초기화 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-16 (v1.2)
> **Status**: Active
> **Planning Doc**: [member-management.plan.md](../../01-plan/features/member-management.plan.md)
> **화면설계서**: p.46-47 (v1.1, 2026-03-30 확정본)
> **관련 정책**: 권한별 수정 제한 정책 (2026-03-30 도입, 2026-04-13 ADMIN 추가, 2026-04-16 관리자 API 확장, 2026-04-16 리뷰 반영)

---

## 1. API Specification

### `GET /api/admin/members` — 회원 목록

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| keyword | string (≤200) | - | ID/성명/이메일/회사명 Like 검색 (DoS 방지 길이 제한) |
| userType | enum | 전체 | 회원유형 필터 (ADMIN / STORE / GENERAL, SEKO 제외) |
| status | enum | 전체 | 상태 필터 (active / deleted / withdrawn) |
| page | int (>0) | 1 | 페이지 번호 |
| pageSize | int (1~100) | 20 | 페이지 크기 |

**서버 처리 흐름:**
1. 관리자 권한 확인 (JWT → `requireAdmin`)
2. QSP `/api/qpartners/userMng/userListMng` 호출 (userTp != SEKO)
3. 검색/필터/페이징을 query parameter 로 QSP 에 위임
4. QSP 응답을 TO-BE 스키마로 매핑하여 반환

**Response (200):**
```json
{
  "data": {
    "totalCount": 1000,
    "page": 1,
    "pageSize": 20,
    "list": [
      {
        "id": 1,
        "userId": "kjy0501@interplug.co.kr",
        "userName": "金志映",
        "userNameKana": "きむ じよん",
        "email": "kjy0501@interplug.co.kr",
        "userType": "GENERAL",
        "companyName": "Interplug corp.",
        "status": "active",
        "lastLoginAt": "2026-02-15T16:28:05Z",
        "createdAt": "2026-03-06T00:00:00Z"
      }
    ]
  }
}
```

---

### `GET /api/admin/members/:id` — 회원 상세정보

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| userTp | enum | Yes | 조회 키 결정용 (ADMIN / STORE / SEKO / GENERAL) |

**서버 처리 흐름:**
1. 관리자 권한 확인
2. `id` + `userTp` 검증 (`memberIdParamSchema`, `userTpSchema`)
3. QSP `/api/qpartners/user/detail` 호출 (`fetchQspUserDetail`)
4. QSP `F_NOT_USER` (탈퇴·삭제 회원) 응답 시 **빈 데이터 + `notFoundInQsp: true` 플래그** 로 200 응답 (프론트 목록 row fallback 용)
5. 502(외부 서버 오류) 는 그대로 전파
6. 정상 응답은 QSP → TO-BE 스키마로 매핑하여 반환

**Response (200, 정상):**
```json
{
  "data": {
    "id": 1,
    "userId": "kjy0501@interplug.co.kr",
    "userName": "金志映",
    "userNameKana": "きむ じよん",
    "firstName": "志映",
    "lastName": "金",
    "firstNameKana": "じよん",
    "lastNameKana": "きむ",
    "email": "kjy0501@interplug.co.kr",
    "userType": "一般",
    "userRole": "GENERAL",
    "companyName": "Interplug corp.",
    "companyNameKana": "いんたーぷらぐ",
    "zipcode": "105-0001",
    "address": "東京都港区...",
    "address2": "",
    "telNo": "0000-000-000",
    "faxNo": "0000-000-000",
    "department": "住宅営業課",
    "jobTitle": "",
    "twoFactorEnabled": true,
    "loginNotification": true,
    "attributeChangeNotification": true,
    "status": "active",
    "newsRcptYn": "Y",
    "notFoundInQsp": false
  }
}
```

> 세부 필드 정의 및 nullable 규칙은 OpenAPI `MemberDetail` 스키마(`src/lib/openapi.ts`) 참조.

**Response (200, F_NOT_USER 탈퇴/삭제):** 위 필드 중 문자열은 빈 문자열 `""`, `twoFactorEnabled: null`, `loginNotification: false`, `attributeChangeNotification: false`, `status: "unknown"`, `userType: "unknown"`, `newsRcptYn: "N"`, `notFoundInQsp: true`

**에러 응답:**

| Status | Description |
|--------|-------------|
| 400 | userTp 누락 / ID 형식 불일치 |
| 401 | 인증 필요 |
| 403 | 관리자 권한 없음 |
| 500 | 서버 내부 오류 |
| 502 | QSP 외부 서버 오류 |

---

### `PUT /api/admin/members/:id` — 회원 상세정보 수정

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| userTp | enum | Yes | 대상 회원 유형 (ADMIN / STORE / SEKO / GENERAL) |

**Request Body:** (모든 필드 optional — 변경할 필드만 전달)

```json
{
  "userRole": "1ST_STORE",
  "twoFactorEnabled": true,
  "loginNotification": false,
  "attributeChangeNotification": false,
  "status": "active",
  "newsRcptYn": "Y"
}
```

#### 권한별 수정 제한 정책 (v1.1, 2026-03-30)

대상 회원의 `userTp` 에 따라 **서버 측에서 허용 필드를 강제** 한다. UI 제한만으로는 API 직접 호출 우회를 막을 수 없으므로 defense-in-depth.

| 대상 userTp | 허용 필드 | 비고 |
|-------------|----------|------|
| `GENERAL` | 전체 필드 | userRole / 2FA / 알림 / status / newsRcptYn 모두 가능 |
| `STORE` | `newsRcptYn` 만 | 외 필드 포함 시 400 |
| `SEKO` | `newsRcptYn` 만 | 외 필드 포함 시 400 |
| `ADMIN` | `newsRcptYn` 만 | 외 필드 포함 시 400 |

**비밀번호 변경은 본 API 범위 밖** — 별도 `POST /api/admin/members/:id/reset-password` 로 처리.

#### 서버 처리 흐름

1. 관리자 권한 확인 (`requireAdmin`)
2. `id` 및 `userTp` 검증
3. Request body 파싱 + `memberUpdateSchema` 검증 (비어있으면 400)
4. QSP 상세 조회 (`fetchQspUserDetail`)
   - 502(외부 서버 오류): 즉시 차단
   - 404/F_NOT_USER (탈퇴·삭제): `preDetail = null` 로 두고 다음 단계 진행 (수정 허용)
5. **권한별 수정 제한 정책 검증** — `userTp !== "GENERAL"` 이면 `newsRcptYn` 외 필드 포함 시 400
6. **STORE + preDetail null 명시 거부** — storeLvl 확보 불가 → 400 (QSP `userListMng` 에 storeLvl 추가 요청 회신 대기 중)
7. **preDetail null + critical 변경 제한** (v1.2) — 탈퇴/삭제 회원에 대한 `userRole` / `twoFactorEnabled` 변경은 fail-closed 400. `status` 복구만 허용 (아래 §1.3)
8. **본인 계정 보호 가드** (아래 §1.3)
9. `userRole` 변경 시 대상 회원이 GENERAL 인지 검증 — preDetail null 은 §1.3 에서 이미 차단되므로 여기서는 `preDetail.userTp` 기준으로만 판정
10. QSP 업데이트 payload 구성 (아래 §1.4)
11. QSP `/api/qpartners/userMng/updateUserDtlMng` 호출
12. `userRole` 변경 경로일 때만 사후 검증 (아래 §1.5)

#### 1.3 본인 계정 보호 가드 및 preDetail null 제약 (self-lockout / self-escalation 방지)

관리자가 **본인 계정**의 critical 필드 3종(`status`, `userRole`, `twoFactorEnabled`)을 변경하려 할 때 차단한다. 추가로 v1.2 부터 탈퇴/삭제 회원(preDetail null) 에 대한 critical 변경 자체를 제한한다.

**preDetail null 경로 제약 (v1.2, 리뷰 반영):**

| 요청 필드 | preDetail null 시 처리 |
|-----------|------------------------|
| `userRole` | **400 차단** — canonical `userTp` 미확인 상태에서 권한 부여 시 권한 상승 위험. 복구 후 재요청 필요 |
| `twoFactorEnabled` | **400 차단** — 기존 2FA 설정 확인 불가 상태에서 변경 시 사일런트 downgrade 위험 |
| `status=active` | 허용 (복구 목적) |
| `newsRcptYn` / `loginNotification` / `attributeChangeNotification` | 허용 (단 기본값 "N" 강제 주입 시 §1.4 warnings 로 통보) |

**self-target 비교 로직:**

- `preDetail` 존재: canonical ID(QSP 반환 `userId/loginId`) 비교 (`isSelfTarget`)
- `preDetail` null(F_NOT_USER): **NFKC 정규화 + 공백 전체 제거 + toLowerCase** 후 `rawId` vs `user.userId` 비교
  - NFKC 로 전각/반각, 한글 조합, ZWSP 등 invisible char 우회 차단
  - 이 경로는 위 제약에 의해 `status` 복구 요청에만 도달 가능
- 자기 자신이면 400 반환: `"自分自身のアカウントに対するこの変更は実行できません"`

#### 1.4 QSP 업데이트 필수 필드 매핑

QSP `updateUserDtlMng` 필수 9개 필드를 `preDetail` + request body + fallback 조합으로 결정.

| QSP 필드 | 결정 우선순위 |
|----------|--------------|
| `loginId` | 관리자 userId |
| `accsSiteCd` | `SITE_DEFAULTS.accsSiteCd` 고정 |
| `userTp` | query parameter |
| `userId` | path `id` (rawId) |
| `authCd` | `request.userRole` ?? `preDetail.authCd` ?? `defaultAuthCdFromUserTp(userTp)` (STORE 는 null 반환 → 위 6번에서 이미 차단 / preDetail null + userRole 조합은 §1.3 에서 차단) |
| `secAuthYn` | `request.twoFactorEnabled` Y/N ?? `preDetail.secAuthYn` ?? "N" (preDetail null + twoFactorEnabled 조합은 §1.3 에서 차단) |
| `loginNotiYn` | `request.loginNotification` ?? `preDetail.loginNotiYn` ?? "N" |
| `attrChgYn` | `request.attributeChangeNotification` ?? `preDetail.attrChgYn` ?? "N" |
| `newsRcptYn` | `request.newsRcptYn` ?? `preDetail.newsRcptYn` ?? "N" |
| `statCd` | `STATUS_TO_STAT_CD[request.status]` ?? `preDetail.statCd` ?? "D" |
| `updBy` | 관리자 userId |

**Fallback 원칙**: `preDetail` null 시 보수적 기본값("N", "D") 적용. STORE 는 storeLvl 의존이라 차단 (§1.2 6번). userRole/twoFactorEnabled 조합은 §1.3 에서 차단.

**Fallback 통보 (v1.2, 리뷰 반영)**: preDetail null 경로에서 기본값이 주입된 QSP 필드 목록을 응답 `warnings` 배열로 클라이언트에 통보하여 사일런트 상태 변경을 방지한다. 통보 대상: `secAuthYn` / `loginNotiYn` / `attrChgYn` / `newsRcptYn` / `authCd` / `statCd` 중 request 에서 대응 필드가 undefined 인 것. (예: `{status:"active"}` 만 보낸 복구 요청 → 나머지 5개 필드가 모두 warnings 에 포함)

#### 1.5 TOCTOU 사후 검증 (MF-6)

`userRole` 변경 경로에서만 업데이트 직후 QSP 를 재조회하여 `userTp` 가 `GENERAL` 을 유지하는지 확인. 불일치 시 CRITICAL 로그 + `warning` 필드로 경고. 롤백은 하지 않는다(감사 탐지 목적).

**`warning` 필드 세팅 경로 (2가지):**

| 케이스 | warning 메시지 |
|--------|---------------|
| 재조회 자체가 502 등으로 실패 | `"更新は完了しましたが、事後検証ができませんでした"` |
| 재조회 성공했으나 `userTp !== "GENERAL"` 감지 (TOCTOU 발생) | `"更新は完了しましたが、対象会員の状態が想定と異なります。確認してください。"` |

`userRole` 미변경 경로에서는 재조회 자체를 수행하지 않으며 `warning` 필드도 포함되지 않는다.

- 근본 해결은 QSP 측 원자적 조건(`expectedUserTp=GENERAL`) 추가 필요 (QSP 개선 요청 대상)

#### Response (200):
```json
{
  "data": {
    "message": "会員情報を更新しました",
    "warning": "更新は完了しましたが、対象会員の状態が想定と異なります。確認してください。",
    "warnings": [
      "secAuthYn が既定値で更新されました (元の値を取得できなかったため)",
      "statCd が既定値で更新されました (元の値を取得できなかったため)"
    ]
  }
}
```

- `warning` (단수): TOCTOU 사후 검증 실패/불일치 시에만 포함 (§1.5)
- `warnings` (복수, v1.2 신규): preDetail null 경로에서 기본값이 주입된 QSP 필드 목록 (§1.4 Fallback 통보)
- 두 필드는 공존 가능하며 각각 독립적으로 세팅된다

#### 에러 응답 매트릭스

| Status | 사유 |
|--------|------|
| 400 | ① 입력 검증 실패 (Zod) / ② 권한별 수정 제한 위반 (userTp≠GENERAL + newsRcptYn 외 필드) / ③ 탈퇴·삭제 STORE 차단 / ④ 본인 계정 critical 변경 차단 / ⑤ userRole 대상 회원 비일반 / ⑥ userTp 파라미터 누락·형식 오류 / ⑦ **preDetail null + userRole/twoFactorEnabled 변경 차단** (v1.2, §1.3) |
| 401 | 인증 필요 |
| 403 | 관리자 권한 없음 |
| 500 | 서버 내부 오류 |
| 502 | QSP 외부 서버 오류 / 응답 스키마 불일치 / resultCode != "S" |

---

### `POST /api/admin/members/:id/reset-password` — 비밀번호 초기화

관리자가 특정 회원의 비밀번호를 초기화. 해당 회원 이메일로 비밀번호 변경 링크 발송.

**서버 처리 흐름:**
1. 관리자 권한 확인
2. 대상 회원 정보 조회 (이메일)
3. PasswordResetToken 생성
4. 비밀번호 변경 링크 메일 발송 (Rate limit 적용)

**Response (200):**
```json
{
  "data": { "message": "비밀번호 변경 링크가 이메일로 발송되었습니다." }
}
```

**에러 응답:** 400 / 401 / 403 / 404 / 429 / 500

---

## 2. File Structure

```
src/app/api/admin/
└── members/
    ├── route.ts                    # GET (목록)
    └── [id]/
        ├── route.ts                # GET (상세), PUT (수정)
        └── reset-password/
            └── route.ts            # POST (비밀번호 초기화)

src/lib/schemas/
└── member.ts                       # memberListQuerySchema, memberUpdateSchema,
                                    # qspMemberDetailSchema, defaultAuthCdFromUserTp

src/lib/
└── qsp-member.ts                   # fetchQspUserDetail (F_NOT_USER 처리 포함)
```

---

## 3. QSP 의존성 및 개선 요청 현황

| 항목 | 현 상태 | 영향 |
|------|---------|------|
| `userListMng` 응답에 `storeLvl` 필드 부재 | QSP 담당자에 추가 요청 (2026-04-16) | 회신 전까지 탈퇴·삭제 STORE 회원 수정 차단(400) |
| `userListMng` 응답에 `newsRcptYn` 필드 부재 | 위와 동일 요청에 포함 | 목록 화면 뉴스레터 표시·필터 불가 |
| `updateUserDtlMng` 원자적 조건(`expectedUserTp=GENERAL`) 미지원 | 차후 요청 예정 | 현재는 사후 재조회 + CRITICAL 로그로 탐지 |

---

## 4. Implementation Order

| # | 작업 | 파일 | 상태 |
|---|------|------|:---:|
| 1 | 회원 목록 API | `members/route.ts` (GET) | ✅ |
| 2 | 회원 상세 API (F_NOT_USER 빈 응답 포함) | `members/[id]/route.ts` (GET) | ✅ |
| 3 | 회원 수정 API (권한별 수정 제한 + 탈퇴·삭제 허용) | `members/[id]/route.ts` (PUT) | ✅ |
| 4 | 비밀번호 초기화 API | `members/[id]/reset-password/route.ts` (POST) | ✅ |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
| 1.1 | 2026-04-16 | 권한별 수정 제한 정책(2026-03-30, 04-13), 탈퇴·삭제 회원 수정 허용(04-15), STORE storeLvl 의존성(04-16), self-lockout 가드, TOCTOU 사후 검증, QSP 필수 9필드 매핑, 에러 응답 매트릭스, userTp query parameter, F_NOT_USER 처리 반영 | CK |
| 1.2 | 2026-04-16 | PR #53 코드 리뷰 반영: §1.3 preDetail null + userRole/twoFactorEnabled fail-closed 차단(에러매트릭스 ⑦), self-target 비교 NFKC 정규화, §1.4 Fallback 통보(warnings 배열) 추가, Response 예시 업데이트 | CK |
