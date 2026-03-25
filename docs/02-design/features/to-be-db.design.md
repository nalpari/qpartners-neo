# TO-BE DB 테이블 설계서 v2

> **Summary**: 화면설계서 v1.0 기준 — 사용자 데이터는 QSP 관리, TO-BE는 서비스 운영 테이블만
>
> **Project**: Q.Partners 리뉴얼
> **Author**: ck
> **Date**: 2026-03-20
> **Status**: Draft
> **Reference**: (Q.Partners) 화면설계서_v1.0_260324

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | TO-BE Q.Partners DB 테이블 설계 v2 (사용자 데이터 QSP 분리) |
| 작성일 | 2026-03-20 |
| 범위 | QSP 테이블 + TO-BE QPartners 테이블 전체 |

| 관점 | 설명 |
|------|------|
| Problem | v1 설계는 사용자 테이블을 TO-BE에 직접 저장했으나, 실제로는 QSP가 사용자 마스터 |
| Solution | QSP에 2개 테이블(qp_general_users + qp_info), TO-BE에 18개 서비스 운영 테이블 |
| Function UX Effect | 3탭 로그인(판매점/시공점/일반), 권한별 메뉴 CRUD, 콘텐츠 관리 |
| Core Value | 사용자 마스터를 QSP에 통합하여 관련 시스템 간 일관성 유지 |

### 테이블 수량

| 구분 | 수량 |
|------|------|
| QSP 생성 테이블 | 2개 (qp_general_users + qp_info) |
| TO-BE QPartners 테이블 | 18개 |
| **합계** | **20개** |

---

## 1. 설계 원칙

### 1.1 사용자 데이터 아키텍처

```
┌──────────────────────────────────────────────────────┐
│                         QSP                            │
│                                                        │
│  [기존 QSP 사용자]            [신규 생성 2개]            │
│  · 사내회원(슈퍼관리자/관리자)   · qp_general_users      │
│  · 1차 판매점                  · qp_info               │
│  · 2차 판매점                                          │
│                                                        │
│  qp_general_users ──┐                                  │
│  기존 판매자 테이블 ──┼── user_id join ──▶ qp_info      │
│  기존 사내회원 ───────┘                                  │
└────────┬───────────────────────────┬───────────────────┘
         │ I/F                       │ I/F
         ▼                           ▼
┌──────────────────┐    ┌────────────────────────────────┐
│  AS-IS QPartners │    │     TO-BE QPartners            │
│  (oldQpartners)  │    │     (Qpartner-neo)             │
│                  │    │                                 │
│  M_SUPPLIER      │    │  · 권한/메뉴 관련 (2 테이블)     │
│  kind=4,5,6,7    │    │  · 콘텐츠 관련 (5 테이블)        │
│  (시공점)        │──▶│  · 인증 관련 (2 테이블)           │
│                  │I/F │  · 관리자 운영 (9 테이블)         │
└──────────────────┘    └────────────────────────────────┘
```

### 1.2 로그인 3탭 데이터 소스 (화면설계서 p.9-10)

| 탭 | 인증 정보 | 데이터 소스 |
|-----|---------|-----------|
| 판매점 회원 | ID(QORDER/MUSUBI/DESIGN) + 비밀번호 | QSP 기존 사용자 |
| 시공점 회원 | 이메일 또는 시공ID + 비밀번호 | AS-IS QPartners I/F |
| 일반 회원 | 이메일 + 비밀번호 | QSP qp_general_users |

### 1.3 공통 설계 원칙

- 화면설계서 v1.0 (260324) 기준 컬럼 설계
- 영문 스네이크케이스 컬럼명
- 적절한 VARCHAR 크기 지정 (text 타입 남용 제거)
- FK 제약 명시 (시스템 내 테이블 간)
- 외부 시스템 참조는 source + external_id 조합

---

## 2. QSP 생성 테이블 (2개)

### 2.1 qp_general_users (일반회원 사용자)

**화면 근거**: 회원가입 (p.16-18), 내정보/회사정보 수정 (p.32-38)
**대상**: TO-BE 신규 가입 일반회원 + AS-IS 시공점 제외 회원
**역할**: 순수 인적정보 + 법인정보만 저장 (QPartners 서비스 설정은 qp_info에서 관리)

```sql
CREATE TABLE qp_general_users (
  id                  INT AUTO_INCREMENT PRIMARY KEY,

  -- 법인정보 ──────────────────────────────────
  -- 화면: 회원가입 > 법인정보 (*필수) 섹션 (p.16)
  company_name        VARCHAR(255) NOT NULL,             -- 화면: 회사명 *
  company_name_kana   VARCHAR(255) DEFAULT NULL,         -- 화면: 회사명 히라가나 *
  zipcode             VARCHAR(10) DEFAULT NULL,          -- 화면: 우편번호 * (주소검색 연동, 7자리)
  address1            VARCHAR(500) DEFAULT NULL,         -- 화면: 주소 * (도도부현 + 시구정촌)
  address2            VARCHAR(500) DEFAULT NULL,         -- 화면: 주소 상세 (빌딩명 등)
  tel                 VARCHAR(20) DEFAULT NULL,          -- 화면: 전화번호 * (000-0000-0000)
  fax                 VARCHAR(20) DEFAULT NULL,          -- 화면: FAX번호 (000-0000-0000)
  corporate_number    VARCHAR(20) DEFAULT NULL,          -- 화면: 법인번호 (내정보 수정 p.39 #2)

  -- 회원정보 ──────────────────────────────────
  -- 화면: 회원가입 > 회원정보 섹션 (p.16)
  last_name           VARCHAR(100) NOT NULL,             -- 화면: 성 *
  first_name          VARCHAR(100) NOT NULL,             -- 화면: 이름 *
  last_name_kana      VARCHAR(100) DEFAULT NULL,         -- 화면: 성 히라가나 *
  first_name_kana     VARCHAR(100) DEFAULT NULL,         -- 화면: 이름 히라가나 *
  email               VARCHAR(255) NOT NULL,             -- 화면: 이메일 (ID) * (중복체크)
  password_hash       VARCHAR(255) NOT NULL,             -- 화면: 비밀번호 * (영문/숫자/기호 2종 8자 이상, bcrypt)
  department          VARCHAR(100) DEFAULT NULL,         -- 화면: 부서명
  job_title           VARCHAR(100) DEFAULT NULL,         -- 화면: 직책

  -- 감사 ─────────────────────────────────────
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_email (email),
  INDEX idx_company_name (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 2.2 qp_info (QPartners 사용자 정보)

**화면 근거**: 회원관리 (p.46-47), 로그인 (p.9-10), 2차인증 (p.14), 최초로그인 설정 (p.13)
**역할**: QSP의 모든 사용자 테이블(qp_general_users, 기존 판매자, 기존 사내회원)과 user_id로 join하여 QPartners 서비스 관련 정보를 통합 관리
**I/F**: 이 테이블의 정보를 포함하여 TO-BE QPartners에 사용자 정보를 I/F

```sql
CREATE TABLE qp_info (
  id                  INT AUTO_INCREMENT PRIMARY KEY,

  -- 사용자 식별 ──────────────────────────────
  -- QSP 내 사용자 테이블과 user_id로 join
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
                      -- ADMIN   = 관리자
                      -- DEALER  = 판매점
                      -- SEKO    = 시공점 (AS-IS QPartners)
                      -- GENERAL = 일반회원 (qp_general_users)
  user_id             VARCHAR(255) NOT NULL,             -- 유형별 사용자 식별자
                      -- ADMIN/DEALER: QSP 사용자 ID
                      -- SEKO: AS-IS M_USER.id (시공점)
                      -- GENERAL: qp_general_users.id
                      -- 화면 p.41 목록: 관리자, 판매점, 일반

  -- 사용자권한 ───────────────────────────────
  -- 화면: 회원관리 상세 > 사용자권한 드롭다운 (p.47 #3)
  -- 회원유형이 일반인 경우에만 변경 가능
  -- 그 외 사용자는 회원 유형값에 맞는 권한 자동 부여
  -- 값: SuperADMIN / ADMIN / Cus1 / Cus2 / Cus3 / Cus4 / Cus5
  user_role           VARCHAR(50) NOT NULL,              -- 권한관리 p.49의 권한코드 값

  -- 2차 인증 ─────────────────────────────────
  -- 화면: 회원관리 상세 (p.47 #5)
  -- 디폴트: 관리자(당사) = 유효, 관리자 외 회원 = 유효
  two_factor_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  -- 화면: 2차인증 팝업 (p.14) — 최근 인증 완료 일시
  two_factor_verified_at DATETIME DEFAULT NULL,

  -- 로그인 알림받기 ──────────────────────────
  -- 화면: 회원관리 상세 (p.47 #6)
  -- 일반회원 대상. 체크 시 홈페이지 로그인한 경우 알림메일 발송
  -- 디폴트: 관리자(당사) = 무효, 관리자 외 회원 = 유효
  login_notification  BOOLEAN NOT NULL DEFAULT TRUE,

  -- 속성변경 알림받기 ────────────────────────
  -- 화면: 회원관리 상세 (p.47 #7)
  -- 마이페이지 정보 변경 시 사용자 이메일로 알림메일 발송
  -- 디폴트: 관리자(당사) = 무효, 관리자 외 회원 = 유효
  attribute_change_notification BOOLEAN NOT NULL DEFAULT TRUE,

  -- 회원상태 ─────────────────────────────────
  -- 화면: 회원관리 상세 (p.47 #8)
  status              ENUM('active','deleted') NOT NULL DEFAULT 'active',
                      -- active = Active (로그인 가능)
                      -- deleted = Delete (로그인 불가)

  -- 탈퇴 ─────────────────────────────────────
  -- 화면: 회원관리 목록 > 탈퇴여부 (p.46), 상세 (p.47 #9)
  withdrawn           BOOLEAN NOT NULL DEFAULT FALSE,    -- 화면: 탈퇴여부 Y/N (p.46)
  withdrawn_at        DATETIME DEFAULT NULL,             -- 화면: 탈퇴일시 (p.47 #9)
  withdrawn_reason    TEXT DEFAULT NULL,                  -- 화면: 탈퇴사유 (p.47 #9, p.41)

  -- 접속/인증 이력 ───────────────────────────
  -- 화면: 회원관리 목록/상세 > 최근접속일시 (p.46, p.47)
  last_login_at       DATETIME DEFAULT NULL,

  -- 이용약관 ─────────────────────────────────
  -- 화면: 로그인 > "이용약관 동의 필수 (보기)" (p.9)
  terms_agreed_at     DATETIME DEFAULT NULL,

  -- 최초로그인 설정 ──────────────────────────
  -- 화면: 최초로그인 후 개인정보 설정 팝업 (p.13)
  -- (1) 비밀번호 재설정 링크로 접속한 경우
  -- (2) 판매점 회원이 Q.ORDER/MUSUBI에 한번도 로그인 하지 않고 Q.PARTNERS에 최초 로그인한 경우
  initial_setup_done  BOOLEAN NOT NULL DEFAULT FALSE,

  -- 비밀번호 ─────────────────────────────────
  -- 화면: 비밀번호 변경 (p.40), 최초로그인 설정 (p.13)
  password_changed_at DATETIME DEFAULT NULL,

  -- ID Save ──────────────────────────────────
  -- 화면: 로그인 > ID Save 체크박스 (p.9 #3)
  -- 로그인 성공 시 다음 접속 시 아이디 저장
  id_save_enabled     BOOLEAN NOT NULL DEFAULT FALSE,

  -- 감사 ─────────────────────────────────────
  -- 화면: 회원관리 상세 > 등록일, 갱신일시(수정자) (p.47 #1)
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by          VARCHAR(255) DEFAULT NULL,         -- 화면: 수정자 (p.47 #1)

  UNIQUE INDEX idx_user_type_id (user_type, user_id),
  INDEX idx_user_role (user_role),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 3. TO-BE QPartners 테이블 (18개)

### 3.1 qp_roles (QPartners 권한 정의)

**화면 근거**: 권한관리 (p.54)

```sql
CREATE TABLE qp_roles (
  id                  INT AUTO_INCREMENT PRIMARY KEY,

  -- 권한 정보 ────────────────────────────────
  -- 화면: 권한관리 > 권한코드/권한명/권한설명 (p.54)
  role_code           VARCHAR(50) NOT NULL,              -- 화면: 권한코드 (수정 불가)
  role_name           VARCHAR(100) NOT NULL,             -- 화면: 권한명 (수정 가능)
  description         VARCHAR(500) DEFAULT NULL,         -- 화면: 권한설명 (수정 가능)
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,     -- 화면: 사용 여부 Y/N (p.54 #3)

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_role_code (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**초기 데이터 (p.54):**

```sql
INSERT INTO qp_roles (role_code, role_name, description) VALUES
  ('SuperADMIN', '슈퍼관리자', '사내직원. 전체 메뉴 CRUD 권한 부여'),
  ('ADMIN',      '관리자',     '사내직원. 담당부문이 작성한 메뉴만 편집권한 부여'),
  ('Cus1',       '1차점',      '1차 판매점 (Q.ORDER회원)'),
  ('Cus2',       '2차 이하',   '2차이하 판매점 (Q.MUSUBI회원)'),
  ('Cus3',       '시공점',     '시공점'),
  ('Cus4',       '일반회원',   '홈페이지에서 가입한 일반회원'),
  ('Cus5',       '비회원',     '비회원');
```

---

### 3.2 qp_role_menu_permissions (역할별 메뉴 CRUD 권한)

**화면 근거**: 권한관리 > Available Menu Setting (p.55)

```sql
CREATE TABLE qp_role_menu_permissions (
  role_code           VARCHAR(50) NOT NULL,              -- qp_roles.role_code 참조
  menu_code           VARCHAR(50) NOT NULL,              -- menus.menu_code 참조

  -- CRUD 권한 ────────────────────────────────
  -- 화면: Menu Setting 팝업 (p.55) — Read/Create/Update/Delete 체크박스
  can_read            BOOLEAN NOT NULL DEFAULT FALSE,
  can_create          BOOLEAN NOT NULL DEFAULT FALSE,
  can_update          BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete          BOOLEAN NOT NULL DEFAULT FALSE,

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (role_code, menu_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**메뉴 구조 (p.55 기준):**

| Level1 | Level2 |
|--------|--------|
| 통합검색 | - |
| 콘텐츠 | - |
| 자료 다운로드 | - |
| 마이페이지 | - |
| - | 내정보/회사정보 수정 |
| - | 다운로드 기능 |
| - | 문의 등록 |
| 관리자 | - |
| - | 회원관리 |
| - | 대량메일 발송 |
| - | 카테고리 관리 |
| - | 권한관리 |
| - | 메뉴관리 |

---

### 3.3 contents (콘텐츠)

**화면 근거**: 콘텐츠 목록 (p.22-24), 등록 (p.25-27), 조회 (p.28-29), 수정 (p.30-31)
**AS-IS**: M_NEWS + M_DOCUMENT + M_MOVIE + M_PRODUCT → 통합

```sql
CREATE TABLE contents (
  id                  INT AUTO_INCREMENT PRIMARY KEY,

  -- 관리정보 ──────────────────────────────────
  -- 화면: 콘텐츠 등록 > 관리정보 섹션 (p.25)
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,  -- 게재담당자 유형
  user_id             VARCHAR(255) NOT NULL,             -- 화면: "게재 담당자" (p.25 #1, read only, 등록자명 자동)
  author_department   VARCHAR(100) DEFAULT NULL,         -- 화면: "담당부문" (p.25 #5, read only, QSP Department)
                                                         -- 저장 시점 값 유지 (p.27 Description)
  approver_level      TINYINT DEFAULT NULL,              -- 화면: "최종승인자 *" 드롭다운 (p.25 #6)
                      -- 값 정의 (p.25 Description #6):
                      -- 1 = 担当(일본어)/실무담당자       순위 1
                      -- 2 = 所属長/소속장                 순위 2
                      -- 3 = 事業部長/사업부장              순위 3
                      -- 4 = 社長/사장                     순위 4

  -- 본문 ─────────────────────────────────────
  -- 화면: 콘텐츠 등록 > 본문 섹션 (p.26)
  title               VARCHAR(500) NOT NULL,             -- 화면: "제목 *" (p.26 #11)
  body                MEDIUMTEXT DEFAULT NULL,            -- 화면: "내용 *" (p.26 #12, 에디터 적용)

  -- 상태 ─────────────────────────────────────
  status              ENUM('draft','published','deleted') NOT NULL DEFAULT 'draft',

  -- 일시 ─────────────────────────────────────
  published_at        DATETIME DEFAULT NULL,             -- 화면: "게재일" (p.25 #2, read only, Today)
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 화면: 목록 > "등록일" (p.23 #6)
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                                         -- 화면: 목록 > "갱신일" (p.23 #7)

  -- 조회수 ───────────────────────────────────
  -- 화면: 콘텐츠 상세 > "조회 1,000" (p.28 #1)
  view_count          INT NOT NULL DEFAULT 0,

  INDEX idx_status (status),
  INDEX idx_published_at (published_at),
  INDEX idx_created_at (created_at),
  INDEX idx_user (user_type, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.4 content_targets (게시대상)

**화면 근거**: 콘텐츠 등록 > 게시대상 체크박스 + 기간설정 (p.25 #7, #8)

```sql
CREATE TABLE content_targets (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  content_id          INT NOT NULL,
  target_type         ENUM('first_dealer','second_dealer','constructor','general','non_member') NOT NULL,
  start_at            DATETIME DEFAULT NULL,
  end_at              DATETIME DEFAULT NULL,

  created_by          VARCHAR(255) DEFAULT NULL,
  INDEX idx_content_id (content_id),
  INDEX idx_target_type (target_type),
  UNIQUE INDEX idx_content_target (content_id, target_type),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.5 categories (카테고리)

**화면 근거**: 카테고리 관리 (p.53), 콘텐츠 검색조건 (p.24), 콘텐츠 등록 (p.25-26)

```sql
CREATE TABLE categories (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  parent_id           INT DEFAULT NULL,                  -- 상위 카테고리 (Depth-2까지, p.53 #8)
  category_code       VARCHAR(50) NOT NULL,              -- 화면: 카테고리코드 * (p.53 #10)
  name                VARCHAR(100) NOT NULL,             -- 화면: 카테고리명 * (p.53 #10)
  is_internal_only    BOOLEAN NOT NULL DEFAULT FALSE,    -- 화면: 사내회원 전용 * Y/N (p.53 #9)
  sort_order          INT NOT NULL DEFAULT 1,            -- 화면: 표시 순서 * (p.53 #10)
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,     -- 화면: 사용 여부 * Y/N (p.53 #10)

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_category_code (category_code),
  INDEX idx_parent_id (parent_id),
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.6 content_categories (콘텐츠-카테고리 연결)

```sql
CREATE TABLE content_categories (
  content_id          INT NOT NULL,
  category_id         INT NOT NULL,
  PRIMARY KEY (content_id, category_id),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.7 content_attachments (첨부파일)

**화면 근거**: 콘텐츠 등록 > 파일첨부 (p.27 #13), 상세 (p.29 #11, #12)

```sql
CREATE TABLE content_attachments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  content_id          INT NOT NULL,
  file_name           VARCHAR(255) NOT NULL,
  file_path           VARCHAR(500) NOT NULL,
  file_size           BIGINT DEFAULT NULL,
  mime_type           VARCHAR(100) DEFAULT NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_content_id (content_id),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.8 password_reset_tokens (비밀번호 초기화)

**화면 근거**: 비밀번호 초기화 팝업 (p.11), 변경 링크 메일 (p.12)

```sql
CREATE TABLE password_reset_tokens (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
  user_id             VARCHAR(255) NOT NULL,
  token               VARCHAR(255) NOT NULL,
  expires_at          DATETIME NOT NULL,
  used                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_token (token),
  INDEX idx_user (user_type, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.9 two_factor_codes (2차 인증)

**화면 근거**: 2차인증 팝업 (p.14), 2단계 인증 알림메일 (p.15)

```sql
CREATE TABLE two_factor_codes (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
  user_id             VARCHAR(255) NOT NULL,
  code                VARCHAR(6) NOT NULL,               -- 인증번호 6자리, 숫자만
  expires_at          DATETIME NOT NULL,                 -- 10분 이내
  verified            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user (user_type, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.10 home_notices (홈화면 공지)

**화면 근거**: 홈화면 공지관리 (p.51-52)

```sql
CREATE TABLE home_notices (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  target_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  target_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  target_first_dealer BOOLEAN NOT NULL DEFAULT FALSE,
  target_second_dealer BOOLEAN NOT NULL DEFAULT FALSE,
  target_constructor  BOOLEAN NOT NULL DEFAULT FALSE,
  target_general      BOOLEAN NOT NULL DEFAULT FALSE,
  start_at            DATETIME NOT NULL,
  end_at              DATETIME NOT NULL,
  content             TEXT NOT NULL,
  url                 VARCHAR(500) DEFAULT NULL,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
  user_id             VARCHAR(255) NOT NULL,
  created_by          VARCHAR(255) DEFAULT NULL,
  updated_by          VARCHAR(255) DEFAULT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_period (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.11 mass_mails (대량메일 발송)

**화면 근거**: 대량메일발송 (p.48-50)

```sql
CREATE TABLE mass_mails (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  sender_name         VARCHAR(255) NOT NULL,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
  user_id             VARCHAR(255) NOT NULL,
  target_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  target_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  target_first_dealer BOOLEAN NOT NULL DEFAULT FALSE,
  target_second_dealer BOOLEAN NOT NULL DEFAULT FALSE,
  target_constructor  BOOLEAN NOT NULL DEFAULT FALSE,
  target_general      BOOLEAN NOT NULL DEFAULT FALSE,
  subject             VARCHAR(500) NOT NULL,
  body                MEDIUMTEXT NOT NULL,
  status              ENUM('draft','sent') NOT NULL DEFAULT 'draft',
  sent_at             DATETIME DEFAULT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_status (status),
  INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.12 mass_mail_recipients (대량메일 CC/BCC 수신자)

```sql
CREATE TABLE mass_mail_recipients (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  mass_mail_id        INT NOT NULL,
  recipient_type      ENUM('cc','bcc') NOT NULL,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
  user_id             VARCHAR(255) NOT NULL,
  email               VARCHAR(255) NOT NULL,

  INDEX idx_mass_mail_id (mass_mail_id),
  UNIQUE INDEX idx_mail_recipient (mass_mail_id, recipient_type, email),
  FOREIGN KEY (mass_mail_id) REFERENCES mass_mails(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.13 mass_mail_attachments (대량메일 첨부파일)

```sql
CREATE TABLE mass_mail_attachments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  mass_mail_id        INT NOT NULL,
  file_name           VARCHAR(255) NOT NULL,
  file_path           VARCHAR(500) NOT NULL,
  file_size           BIGINT DEFAULT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_mass_mail_id (mass_mail_id),
  FOREIGN KEY (mass_mail_id) REFERENCES mass_mails(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.14 download_logs (다운로드 기록)

**화면 근거**: 마이페이지 > 다운로드 기록 (p.42)

```sql
CREATE TABLE download_logs (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
  user_id             VARCHAR(255) NOT NULL,
  content_id          INT NOT NULL,
  attachment_id       INT NOT NULL,
  downloaded_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user (user_type, user_id),
  INDEX idx_downloaded_at (downloaded_at),
  FOREIGN KEY (content_id) REFERENCES contents(id),
  FOREIGN KEY (attachment_id) REFERENCES content_attachments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.15 inquiries (문의등록)

**화면 근거**: 마이페이지 > 문의등록 (p.43-44)

```sql
CREATE TABLE inquiries (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_type           ENUM('ADMIN','DEALER','SEKO','GENERAL') DEFAULT NULL,
  user_id             VARCHAR(255) DEFAULT NULL,
  company_name        VARCHAR(255) NOT NULL,             -- 저장 시점 회사명
  user_name           VARCHAR(200) NOT NULL,             -- 저장 시점 성명
  tel                 VARCHAR(20) DEFAULT NULL,          -- 저장 시점 전화번호
  email               VARCHAR(255) NOT NULL,             -- 저장 시점 이메일
  inquiry_type        VARCHAR(100) DEFAULT NULL,         -- 문의유형 드롭다운 (p.43 #6)
  title               VARCHAR(500) NOT NULL,
  content             TEXT NOT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user (user_type, user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.16 menus (메뉴관리)

**화면 근거**: 관리자 > 메뉴관리 (p.56)

```sql
CREATE TABLE menus (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  parent_id           INT DEFAULT NULL,
  menu_code           VARCHAR(50) NOT NULL,
  menu_name           VARCHAR(100) NOT NULL,
  page_url            VARCHAR(500) DEFAULT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_top_nav     BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_mobile      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INT NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_menu_code (menu_code),
  INDEX idx_parent_id (parent_id),
  FOREIGN KEY (parent_id) REFERENCES menus(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**초기 데이터 (p.56):**

```sql
-- 1-Level 메뉴
INSERT INTO menus (menu_code, menu_name, show_in_top_nav, show_in_mobile, sort_order) VALUES
  ('SEARCH',   '통합검색',   TRUE, TRUE,  1),
  ('CONTENTS', '콘텐츠',     TRUE, TRUE,  2),
  ('MYPAGE',   '마이페이지', TRUE, TRUE,  3),
  ('ADMIN',    '관리자',     TRUE, FALSE, 4);

-- 2-Level 메뉴 (마이페이지 하위)
INSERT INTO menus (parent_id, menu_code, menu_name, show_in_mobile, sort_order) VALUES
  ((SELECT id FROM menus WHERE menu_code='MYPAGE'), 'MY_INFO',     '내정보/회사정보', TRUE, 1),
  ((SELECT id FROM menus WHERE menu_code='MYPAGE'), 'MY_DOWNLOAD', '다운로드 기록',   TRUE, 2),
  ((SELECT id FROM menus WHERE menu_code='MYPAGE'), 'MY_INQUIRY',  '문의등록',        TRUE, 3);

-- 2-Level 메뉴 (관리자 하위)
INSERT INTO menus (parent_id, menu_code, menu_name, show_in_mobile, sort_order) VALUES
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_MEMBER',   '회원관리',       FALSE, 1),
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_MAIL',     '대량메일 발송',  FALSE, 2),
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_HOME',     '홈화면 공지',    FALSE, 3),
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_CATEGORY', '카테고리 관리',  FALSE, 4),
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_AUTH',     '권한관리',       FALSE, 5),
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_MENU',     '메뉴관리',       FALSE, 6),
  ((SELECT id FROM menus WHERE menu_code='ADMIN'), 'ADM_CODE',     '코드 관리',      FALSE, 7);
```

---

### 3.17 code_headers (코드관리 헤더)

**화면 근거**: 관리자 > 코드 관리 (p.57)

```sql
CREATE TABLE code_headers (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  header_code         VARCHAR(20) NOT NULL,
  header_id           VARCHAR(50) NOT NULL,
  header_name         VARCHAR(255) NOT NULL,
  rel_code1           VARCHAR(50) DEFAULT NULL,
  rel_code2           VARCHAR(50) DEFAULT NULL,
  rel_code3           VARCHAR(50) DEFAULT NULL,
  rel_num1            DECIMAL(15,2) DEFAULT NULL,
  rel_num2            DECIMAL(15,2) DEFAULT NULL,
  rel_num3            DECIMAL(15,2) DEFAULT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_header_code (header_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 3.18 code_details (코드관리 디테일)

```sql
CREATE TABLE code_details (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  header_id           INT NOT NULL,
  code                VARCHAR(20) NOT NULL,
  display_code        VARCHAR(20) NOT NULL,
  code_name           VARCHAR(255) NOT NULL,
  code_name_etc       VARCHAR(255) DEFAULT NULL,
  rel_code1           VARCHAR(50) DEFAULT NULL,
  rel_code2           VARCHAR(50) DEFAULT NULL,
  rel_code3           VARCHAR(50) DEFAULT NULL,
  rel_num1            DECIMAL(15,2) DEFAULT NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_header_id (header_id),
  UNIQUE INDEX idx_header_code (header_id, code),
  FOREIGN KEY (header_id) REFERENCES code_headers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**초기 데이터 (p.57):**

```sql
INSERT INTO code_headers (header_code, header_id, header_name) VALUES
  ('100300', 'STAT_CD',  'Status'),
  ('100600', 'COMPANY',  'Company'),
  ('100700', 'MATL_GR',  'Material Group'),
  ('100800', 'MATL_TP',  'Material Type');
```

---

## 4. 테이블 전체 요약

### QSP 생성 테이블 (2개)

| # | 테이블 | 용도 | 화면 근거 |
|---|--------|------|---------|
| 1 | qp_general_users | 일반회원 순수 인적정보 + 법인정보 | 회원가입 p.16, 내정보수정 p.39 |
| 2 | qp_info | 모든 사용자의 QP 서비스 설정 (user_id join) | 회원관리 p.46-47, 로그인 p.9, 2차인증 p.14, 최초설정 p.13 |

### TO-BE QPartners 테이블 (18개)

| # | 구분 | 테이블 | 용도 |
|---|------|--------|------|
| 1 | 권한 | qp_roles | 권한 정의 (7개 역할) |
| 2 | 권한 | qp_role_menu_permissions | 역할별 메뉴 CRUD 권한 |
| 3 | 콘텐츠 | contents | 콘텐츠 CRUD |
| 4 | 콘텐츠 | content_targets | 게시대상 + 기간 |
| 5 | 콘텐츠 | categories | 카테고리 (Depth-2 트리) |
| 6 | 콘텐츠 | content_categories | 콘텐츠-카테고리 N:M |
| 7 | 콘텐츠 | content_attachments | 콘텐츠 첨부파일 |
| 8 | 인증 | password_reset_tokens | 비밀번호 초기화 토큰 |
| 9 | 인증 | two_factor_codes | 2차인증 코드 (6자리, 10분) |
| 10 | 관리 | home_notices | 홈화면 공지 (최대 5개) |
| 11 | 관리 | mass_mails | 대량메일 발송 |
| 12 | 관리 | mass_mail_recipients | 대량메일 CC/BCC 수신자 |
| 13 | 관리 | mass_mail_attachments | 대량메일 첨부파일 |
| 14 | 관리 | download_logs | 다운로드 기록 |
| 15 | 관리 | inquiries | 문의등록 |
| 16 | 시스템 | menus | 메뉴관리 (Level1/2) |
| 17 | 시스템 | code_headers | 코드관리 헤더 |
| 18 | 시스템 | code_details | 코드관리 디테일 |

### 전체 합계

| 위치 | 테이블 수 |
|------|---------|
| QSP | 2개 |
| TO-BE QPartners | 18개 |
| **합계** | **20개** |

---

## 5. ER 관계도

### QSP 테이블 관계

```
┌─────────────────────────┐
│   qp_general_users      │
│                         │
│  id, email,             │
│  company_name,          │     user_id join
│  password_hash ...      │──────────────────┐
└─────────────────────────┘                  │
                                             ▼
┌─────────────────┐              ┌───────────────────────────┐
│ QSP 기존        │              │        qp_info            │
│ 판매자 테이블   │──────────────▶│                           │
└─────────────────┘   user_id    │  user_type, user_id,      │
                      join       │  user_role,               │
┌─────────────────┐              │  two_factor_enabled,      │
│ QSP 기존        │              │  two_factor_verified_at,  │
│ 사내회원        │──────────────▶│  login_notification,      │
└─────────────────┘              │  attribute_change_notif,  │
                                 │  status, withdrawn,       │
                                 │  last_login_at,           │
                                 │  terms_agreed_at,         │
                                 │  initial_setup_done,      │
                                 │  password_changed_at,     │
                                 │  id_save_enabled          │
                                 └───────────────────────────┘
                                             │
                                             │ I/F (사용자 정보 + 권한)
                                             ▼
                                   TO-BE QPartners
```

### TO-BE QPartners 테이블 관계

```
┌───────────┐      ┌──────────────────────────┐
│ qp_roles  │──1:N──▶ qp_role_menu_permissions│
│           │      │  (role_code, menu_code,  │
│ role_code,│      │   can_RCUD)              │
│ role_name │      └──────────────────────────┘
└───────────┘

┌──────────────────────────────────────────────┐
│                  contents                      │
└──┬──────────┬──────────┬──────────────────────┘
   │ 1:N      │ N:M      │ 1:N
   ▼          ▼          ▼
┌──────────┐ ┌────────┐ ┌──────────────┐
│ content_ │ │content_│ │  content_    │
│ targets  │ │categori│ │ attachments  │ ◀── download_logs
└──────────┘ │es      │ └──────────────┘
             └───┬────┘
                 ▼
             ┌────────┐
             │categori│
             │es      │
             └────────┘

┌──────────────┐  ┌──────────────┐  ┌─────────────┐
│password_reset│  │ two_factor_  │  │ home_       │
│_tokens       │  │ codes        │  │ notices     │
└──────────────┘  └──────────────┘  └─────────────┘

┌────────────┐  ┌───────────────┐  ┌───────────────┐
│ mass_mails │──┤mass_mail_    │  │mass_mail_     │
│            │  │recipients    │  │attachments    │
└────────────┘  └───────────────┘  └───────────────┘

┌────────────┐  ┌────────┐  ┌──────────────┐  ┌──────────────┐
│ inquiries  │  │ menus  │  │ code_headers │──│ code_details │
└────────────┘  └────────┘  └──────────────┘  └──────────────┘
```

---

## 6. 외부 시스템 사용자 참조 패턴

TO-BE 테이블에서 사용자를 참조할 때 FK를 사용할 수 없으므로 (외부 시스템), 다음 패턴을 사용:

```sql
user_type         ENUM('ADMIN','DEALER','SEKO','GENERAL') NOT NULL,
user_id           VARCHAR(255) NOT NULL,
```

| user_type | 의미 | user_id 값 |
|-----------|------|-----------|
| ADMIN | 관리자 | QSP 사용자 ID |
| DEALER | 판매점 | QSP 사용자 ID |
| SEKO | 시공점 (AS-IS QPartners) | M_USER.id |
| GENERAL | 일반회원 | qp_general_users.id |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 (v1) | 2026-03-19 | 초안 (users 테이블 TO-BE 직접 저장 구조) | ck |
| 0.2 (v2) | 2026-03-20 | 사용자 데이터 QSP 분리 — QSP 2테이블 + TO-BE 18테이블 | ck |
