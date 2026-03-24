# DB Migration Design: Q.PARTNERS PHP → Next.js

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | DB 스키마 마이그레이션 (사용자/문서/뉴스) |
| 작성일 | 2026-03-10 |
| 대상 | AS-IS MySQL(MyISAM/InnoDB) → TO-BE MariaDB(InnoDB) + Prisma |

| 관점 | 설명 |
|------|------|
| Problem | 레거시 PHP 커스텀 MVC + MySQL, 타입 안전성 없음, 정규화 부족, 암묵적 FK |
| Solution | Next.js + MariaDB + Prisma ORM 기반 모던 스키마 재설계 |
| Function UX Effect | 타입 안전 쿼리, 명시적 관계, 검색/필터 성능 개선 |
| Core Value | 유지보수성, 확장성, 개발 생산성 향상 |

---

## 1. AS-IS 분석

### 1.1 대상 테이블 목록

| # | AS-IS 테이블 | 엔진 | 설명 | 레코드(추정) |
|---|-------------|------|------|-------------|
| 1 | M_USER | InnoDB | 사용자 계정 | ~2,876 |
| 2 | M_USER_PRE_ENTRY | InnoDB | 사전등록(임시) | - |
| 3 | M_SUPPLIER | MyISAM | 파트너사/대리점 | ~2,487 |
| 4 | M_DOCUMENT | MyISAM | 자료/문서 | ~110 |
| 5 | M_NEWS | MyISAM | 뉴스/공지 | ~66 |
| 6 | M_CATEGORY | MyISAM | 카테고리(공용) | ~217 |
| 7 | R_DATA | MyISAM | 관계 테이블(범용) | - |
| 8 | R_HISTORY | InnoDB | 문서 다운로드 이력 | - |
| 9 | R_HISTORY_NEWS | InnoDB | 뉴스 열람 이력 | - |
| 10 | A_STAFF | MyISAM | 관리자 | ~17 |
| 11 | A_SITE | MyISAM | 사이트 설정 | 1 |
| 12 | M_DELTA_ID_SEQUENCE | InnoDB | 델타 ID 시퀀스 | ~265 |

### 1.2 AS-IS 테이블 상세 (DDL)

#### M_USER (사용자)

```sql
CREATE TABLE M_USER (
  id              int(11) NOT NULL AUTO_INCREMENT,
  site            int(11) NOT NULL,                    -- 사이트 ID (FK → A_SITE)
  register        int(11) DEFAULT NULL,                -- 등록자 (관리자 ID)
  register_user   int(11) DEFAULT NULL,                -- 등록 사용자
  updater         int(11) DEFAULT NULL,                -- 수정자
  add_user        int(11) DEFAULT NULL,                -- 추가 등록자
  status          char(1) NOT NULL,                    -- 상태: 1=이용가, 2=이용불가, 3=미승인, 4=탈퇴, 5=이용가(WEB연수)
  admin_flag      tinyint(4) DEFAULT 0,                -- 0=일반, 1=대표계정
  user_division   tinyint(4) DEFAULT NULL,             -- 1=일반, 2=사내
  sales_type      tinyint(4) DEFAULT NULL,             -- 1=영업계정
  login_id        text,                                -- 로그인ID (이메일)
  password        text,                                -- 비밀번호 (평문 또는 MD5)
  password_u_date datetime DEFAULT NULL,               -- 비밀번호 변경일
  sei             text,                                -- 성(姓)
  mei             text,                                -- 이름(名)
  sei_kana        text,                                -- 성 카나
  mei_kana        text,                                -- 이름 카나
  user_name       text,                                -- 회사명
  user_name_kana  text,                                -- 회사명 카나
  branch_office   text,                                -- 지점명
  user_zipcode    text,                                -- 우편번호
  user_pref       tinyint(4) DEFAULT NULL,             -- 도도부현 (1~47)
  user_address1   text,                                -- 주소1
  user_address2   text,                                -- 주소2
  user_tel        text,                                -- 전화번호
  user_fax        text,                                -- FAX
  status_auth     tinyint(4) DEFAULT NULL,             -- 추가 권한 (1=부여)
  hqj_department  tinyint(4) DEFAULT NULL,             -- HQJ 부서 (1~15)
  hqj_staff       int(11) DEFAULT NULL,                -- 담당 관리자 (FK → A_STAFF)
  seko_id         text,                                -- 시공ID
  seko_kind       text,                                -- 시공종류 (1=Qcells, 2=Hanwha, 3=SmartRack)
  seko_status     tinyint(4) DEFAULT NULL,             -- 시공ID 상태 (1=유효, 2=만료)
  seko_issue_date date DEFAULT NULL,                   -- 시공ID 발행일
  seko_limit      date DEFAULT NULL,                   -- 시공ID 유효기한
  seko_up_time    datetime DEFAULT NULL,               -- 시공ID 갱신기한
  mail_flag       tinyint(4) DEFAULT NULL,             -- 메일 수신 플래그
  mail_mag_disallow_flag tinyint(4) DEFAULT NULL,      -- 메일매거진 수신거부
  delta_id        text DEFAULT NULL,                   -- 델타 ID
  delta_status    tinyint(4) DEFAULT NULL,             -- 델타 상태 (1=유효, 2=만료)
  delta_issue_date date DEFAULT NULL,                  -- 델타 ID 발행일
  face_photo_file text DEFAULT NULL,                   -- 얼굴 사진
  group_kind      tinyint(4) DEFAULT NULL,             -- 그룹 (10=A, 20=B, 30=C)
  unsubscribe_flag tinyint(4) DEFAULT NULL,            -- 탈퇴 플래그
  unsubscribe_date datetime DEFAULT NULL,              -- 탈퇴일
  seko_id_certificate text DEFAULT NULL,               -- 시공ID 증명서
  r_date          datetime NOT NULL,                   -- 등록일
  u_date          datetime NOT NULL,                   -- 수정일
  PRIMARY KEY (id)
) ENGINE=InnoDB AUTO_INCREMENT=2876 DEFAULT CHARSET=utf8;
```

**문제점:**
- `text` 타입 남용 (login_id, password, tel 등은 varchar 적절)
- 비밀번호 해싱 방식 불명확 (보안 위험)
- FK 제약 없음 (site, hqj_staff 등)
- 인덱스 없음 (login_id 검색 시 full scan)
- `seko_kind`가 text인데 실제 1,2,3 값만 사용
- 파트너 유형별 컬럼이 하나의 테이블에 혼재 (seko_*, delta_*)

#### M_SUPPLIER (파트너사)

```sql
CREATE TABLE M_SUPPLIER (
  id              int(11) NOT NULL AUTO_INCREMENT,
  site            int(11) NOT NULL,
  register        int(11) DEFAULT NULL,
  updater         int(11) DEFAULT NULL,
  status          char(1) NOT NULL,
  kind            tinyint(4) DEFAULT NULL,             -- 종류: 1=1차점, 2=2차점, 3=HWJ, 4=시공점, 5=시공점(델타), 6=시공점(스미토모), 7=시공점(델타SAVeR-H2)
  code            text,
  name            text,                                -- 회사명
  name_kana       text,
  zipcode         text,
  pref            tinyint(4) DEFAULT NULL,             -- 도도부현
  address1        text,
  address2        text,
  tel             text,
  fax             text,
  system_1        tinyint(4) DEFAULT NULL,             -- 주택시스템 판매동수
  system_2        tinyint(4) DEFAULT NULL,             -- 저압시스템 판매kW
  system_3        tinyint(4) DEFAULT NULL,             -- 산업용시스템 판매kW
  status_handling tinyint(4) DEFAULT NULL,             -- Q-Cells 취급 유무
  handling_1      text,                                -- 주택안건
  handling_2      text,                                -- 저압안건
  handling_maker  text NOT NULL,
  conditions      text,                                -- 업태
  conditions_etc  text,
  foundation_y    text,                                -- 설립연도
  foundation_m    text,                                -- 설립월
  pref_area       text,                                -- 판매 에어리어
  employees_1     text,                                -- 종업원수(사원)
  employees_2     text,                                -- 종업원수(영업)
  status_sales_channels tinyint(4) DEFAULT NULL,       -- 상류 (1=직접, 2=상위상류)
  sales_channels  text,
  status_starter_kit int(11) DEFAULT NULL,             -- 스타터킷 (1=미발송, 2=발송완료)
  starter_kit_1   text,
  starter_kit_2   text,                                -- 발송전표번호
  month           int(11) DEFAULT NULL,
  day             int(11) DEFAULT NULL,
  trading_history text,
  introducing_source text,                             -- 소개원 대리점
  introducing_staff text,
  introducing_email text,
  r_date          datetime NOT NULL,
  u_date          datetime NOT NULL,
  PRIMARY KEY (id)
) ENGINE=MyISAM AUTO_INCREMENT=2487 DEFAULT CHARSET=utf8;
```

#### M_DOCUMENT (문서/자료)

```sql
CREATE TABLE M_DOCUMENT (
  id              int(11) NOT NULL AUTO_INCREMENT,
  site            int(11) NOT NULL,
  register        int(11) NOT NULL,
  updater         int(11) NOT NULL,
  status          char(1) DEFAULT NULL,                -- 상태
  status_app      tinyint(4) DEFAULT NULL,             -- 승인상태
  filename        text,                                -- 파일명
  revision_date   date DEFAULT NULL,                   -- 개정일
  name            text,                                -- 문서명
  document_kana   text,                                -- 후리가나
  list_new        tinyint(4) DEFAULT NULL,             -- 신착표시
  search_flag     tinyint(1) DEFAULT NULL,             -- 검색 플래그
  open_flag       tinyint(1) DEFAULT NULL,             -- 비로그인 공개
  search_keywords text,                                -- 검색 키워드
  -- 그룹별 공개기간
  st_time_1       datetime DEFAULT NULL,               -- 그룹A 공개시작
  ed_time_1       datetime DEFAULT NULL,               -- 그룹A 공개종료
  st_time_2       datetime DEFAULT NULL,               -- 그룹B 공개시작
  ed_time_2       datetime DEFAULT NULL,               -- 그룹B 공개종료
  st_time_3       datetime DEFAULT NULL,               -- 그룹C 공개시작
  ed_time_3       datetime DEFAULT NULL,               -- 그룹C 공개종료
  st_time_delta   datetime DEFAULT NULL,               -- 델타 공개시작
  ed_time_delta   datetime DEFAULT NULL,               -- 델타 공개종료
  r_date          datetime NOT NULL,
  u_date          datetime NOT NULL,
  PRIMARY KEY (id)
) ENGINE=MyISAM AUTO_INCREMENT=110 DEFAULT CHARSET=utf8;
```

**문제점:**
- 그룹별 공개기간이 하드코딩된 컬럼 (st_time_1~3, delta) → 그룹 추가 시 ALTER TABLE 필요
- 카테고리 연결이 R_DATA 범용 테이블 의존

#### M_NEWS (뉴스)

```sql
CREATE TABLE M_NEWS (
  id              int(11) NOT NULL AUTO_INCREMENT,
  site            int(11) NOT NULL,
  register        int(11) NOT NULL,
  updater         int(11) DEFAULT NULL,
  status          tinyint(1) NOT NULL,                 -- 상태
  status_app      tinyint(11) DEFAULT NULL,            -- 승인상태
  type            tinyint(1) NOT NULL,                 -- 1=페이지, 2=외부링크, 3=파일
  title           text NOT NULL,
  keywords        text,
  description     text,
  date            date NOT NULL,                       -- 공개일
  url             text,                                -- 외부링크 URL
  window          char(1) DEFAULT NULL,                -- 새 창 여부
  filename        text,
  alt_text        text,
  content         mediumtext,                          -- 본문 HTML
  search_keywords text,                                -- 검색 키워드
  -- 그룹별 공개기간 (M_DOCUMENT와 동일 패턴)
  st_time_1       datetime DEFAULT NULL,
  ed_time_1       datetime DEFAULT NULL,
  st_time_2       datetime DEFAULT NULL,
  ed_time_2       datetime DEFAULT NULL,
  st_time_3       datetime DEFAULT NULL,
  ed_time_3       datetime DEFAULT NULL,
  st_time_delta   datetime DEFAULT NULL,
  ed_time_delta   datetime DEFAULT NULL,
  r_date          datetime NOT NULL,
  u_date          datetime NOT NULL,
  PRIMARY KEY (id)
) ENGINE=MyISAM AUTO_INCREMENT=66 DEFAULT CHARSET=utf8;
```

#### M_CATEGORY (카테고리 - 공용)

```sql
CREATE TABLE M_CATEGORY (
  id              int(11) NOT NULL AUTO_INCREMENT,
  site            int(11) NOT NULL,
  register        int(11) DEFAULT NULL,
  updater         int(11) DEFAULT NULL,
  plugin          varchar(16) NOT NULL,                -- 대상 플러그인 (Movie, Document, News, Product 등)
  code            smallint(6) NOT NULL,                -- 카테고리 코드
  full_code       varchar(18) NOT NULL,                -- 계층코드 (예: "001001002")
  level           tinyint(4) NOT NULL,                 -- 계층 깊이 (최대 3)
  name            text NOT NULL,
  status          tinyint(1) NOT NULL,
  sort_num        int(11) NOT NULL,
  summary         text,
  seminar_detail  mediumtext,
  filename        text,
  color_bg        text,
  color_text      text,
  r_date          datetime NOT NULL,
  u_date          datetime NOT NULL,
  PRIMARY KEY (id)
) ENGINE=MyISAM AUTO_INCREMENT=217 DEFAULT CHARSET=utf8;
```

#### R_DATA (범용 관계 테이블)

```sql
CREATE TABLE R_DATA (
  site            int(11) DEFAULT NULL,
  plugin          varchar(16) NOT NULL,                -- 플러그인명
  data_id         int(11) NOT NULL,                    -- 데이터 ID
  relation        text NOT NULL,                       -- 관계 종류 (supplier, category 등)
  relation_id     int(11) NOT NULL,                    -- 관계 대상 ID
  sort_num        int(11) NOT NULL,
  extra           int(11) DEFAULT NULL,
  tmp_data        int(11) DEFAULT 0,
  KEY data_id (data_id)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
```

**사용 패턴:**
- `plugin='User', relation='Supplier'` → 사용자-파트너사 연결
- `plugin='Document', relation='Category'` → 문서-카테고리 연결
- `plugin='News', relation='Category'` → 뉴스-카테고리 연결

#### R_HISTORY (문서 다운로드 이력)

```sql
CREATE TABLE R_HISTORY (
  id              int(11) NOT NULL AUTO_INCREMENT,
  user_id         int(11) NOT NULL,
  user_name       text,
  document_id     int(11) NOT NULL,
  title           text NOT NULL,
  file_name       text,
  category        text,
  date            datetime NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### R_HISTORY_NEWS (뉴스 열람 이력)

```sql
CREATE TABLE R_HISTORY_NEWS (
  id              int(11) NOT NULL AUTO_INCREMENT,
  user_id         int(11) NOT NULL,
  user_name       text,
  news_id         int(11) NOT NULL,
  title           text NOT NULL,
  category        text,
  date            datetime NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### A_STAFF (관리자)

```sql
CREATE TABLE A_STAFF (
  id              bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  register        int(11) DEFAULT NULL,
  updater         int(11) DEFAULT NULL,
  enabled         tinyint(4) NOT NULL DEFAULT 1,       -- 유효상태
  retire          int(11) DEFAULT 0,                   -- 퇴직 플래그
  login_pass      varchar(128) CHARACTER SET utf8 COLLATE utf8_bin, -- 비밀번호
  staff_name      varchar(512) DEFAULT NULL,
  email           varchar(128) DEFAULT NULL,
  filename        text,                                -- 프로필 이미지
  admin_flg       tinyint(4) NOT NULL DEFAULT 0,       -- 1=슈퍼관리자, 2=매니저, 3=스태프
  last_ctrl_time  datetime DEFAULT NULL,
  last_ctrl_plugin text,
  remind_token    text,
  miss_count      int(11) DEFAULT 0,                   -- 로그인 실패 횟수
  lock_token      int(11) DEFAULT NULL,
  -- UI 설정 (개인화)
  setting_mycolor text,
  setting_theme   int(11) DEFAULT NULL,
  setting_fontsize int(11) DEFAULT NULL,
  setting_pluginsize int(11) DEFAULT NULL,
  setting_pluginsort text,
  setting_search_height int(11) DEFAULT NULL,
  setting_search_window int(11) DEFAULT 0,
  r_date          datetime NOT NULL,
  u_date          datetime NOT NULL,
  UNIQUE KEY id (id),
  KEY admin_flg (admin_flg)
) ENGINE=MyISAM AUTO_INCREMENT=17 DEFAULT CHARSET=utf8;
```

### 1.3 AS-IS 문제점 종합

| # | 문제 | 상세 | 영향 |
|---|------|------|------|
| 1 | FK 제약 없음 | 모든 관계가 암묵적, R_DATA로 범용 처리 | 데이터 무결성 위험 |
| 2 | text 타입 남용 | login_id, password, tel 등 text 사용 | 인덱스 불가, 성능 저하 |
| 3 | 그룹별 공개기간 하드코딩 | st_time_1~3, delta 컬럼 반복 | 그룹 추가 시 스키마 변경 필요 |
| 4 | 비밀번호 보안 | 해싱 방식 불명확 | 보안 위험 |
| 5 | MyISAM 혼용 | 트랜잭션 미지원 테이블 존재 | 데이터 일관성 위험 |
| 6 | 이력 테이블 비정규화 | user_name, title 등 중복 저장 | 데이터 불일치 가능 |
| 7 | 범용 R_DATA | 모든 관계를 하나의 테이블로 | 쿼리 복잡, 타입 안전성 없음 |
| 8 | 파트너 유형 혼재 | M_USER에 seko_*, delta_* 컬럼 동거 | 확장 어려움 |

---

## 2. TO-BE 설계

### 2.1 설계 원칙

1. **MariaDB** (InnoDB 통일) + **Prisma ORM**
2. **명시적 FK** 관계 설정
3. 그룹별 공개기간 → **별도 테이블로 정규화** (그룹 추가 시 스키마 변경 불필요)
4. **bcrypt** 비밀번호 해싱
5. 기존 **int AUTO_INCREMENT ID 유지** (마이그레이션 호환)
6. **soft delete** 패턴 (withdrawn_at)
7. **timestamp** 자동 관리 (created_at, updated_at)
8. 회원관리 **확장 가능 구조** (신규 기능 추가 대비)

### 2.2 논리 ERD

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Supplier   │←1:N─│     User     │──N:M│    Document      │
│  (파트너사)   │     │   (사용자)    │     │   (문서/자료)     │
└─────────────┘     └──────┬───────┘     └────────┬─────────┘
                           │                       │
                      1:N  │                  N:M  │
                           ▼                       ▼
                    ┌──────────────┐     ┌──────────────────┐
                    │  UserCert    │     │ DocumentCategory │
                    │ (시공ID/인증) │     │  (문서-카테고리)   │
                    └──────────────┘     └────────┬─────────┘
                                                  │
┌──────────────┐                         ┌────────▼─────────┐
│     News     │──N:M────────────────────│    Category      │
│   (뉴스)     │                         │   (카테고리)      │
└──────┬───────┘                         └──────────────────┘
       │
  N:M  │         ┌──────────────────┐
       ▼         │  ContentVisibility│
┌──────────────┐ │ (공개기간/그룹별)  │
│ NewsCategory │ └──────────────────┘
└──────────────┘    ↑ Document, News 공통

┌──────────────┐  ┌──────────────────┐
│ DownloadLog  │  │   NewsViewLog    │
│(다운로드이력)  │  │  (뉴스열람이력)   │
└──────────────┘  └──────────────────┘

┌──────────────┐
│  AdminUser   │
│  (관리자)     │
└──────────────┘
```

### 2.3 물리 설계 (Prisma Schema - MariaDB)

```prisma
// ============================================================
// datasource & generator
// ============================================================
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ============================================================
// ENUMS (MariaDB 네이티브 ENUM 지원)
// ============================================================

enum UserStatus {
  ACTIVE          // 1: 이용가
  INACTIVE        // 2: 이용불가
  PENDING         // 3: 미승인
  WITHDRAWN       // 4: 탈퇴
  WEB_SEMINAR     // 5: WEB연수 전용
}

enum UserDivision {
  GENERAL         // 1: 일반
  INTERNAL        // 2: 사내
}

enum SupplierKind {
  PRIMARY         // 1: 1차점
  SECONDARY       // 2: 2차점
  HWJ             // 3: HWJ (본사)
  SEKO            // 4: 시공점
  SEKO_DELTA      // 5: 시공점(델타)
  SEKO_SUMITOMO   // 6: 시공점(스미토모)
  SEKO_DELTA2     // 7: 시공점(델타SAVeR-H2)
}

enum GroupKind {
  A               // 10: 그룹A
  B               // 20: 그룹B
  C               // 30: 그룹C
  DELTA           // 시공점(델타) 전용
}

enum CertStatus {
  VALID           // 유효
  EXPIRED         // 만료
}

enum CertType {
  SEKO            // 시공ID
  DELTA           // 델타ID
}

enum SekoKind {
  QCELLS          // 1: Qcells 시공가
  HANWHA          // 2: Hanwha 패널 시공가
  SMART_RACK      // 3: 스마트랙 시공가
}

enum ContentStatus {
  DRAFT           // 비공개
  PUBLISHED       // 공개
  ARCHIVED        // 보관
}

enum ApprovalStatus {
  PENDING         // 승인대기
  APPROVED        // 승인
  REJECTED        // 반려
}

enum NewsType {
  PAGE            // 1: 페이지 콘텐츠
  EXTERNAL_LINK   // 2: 외부 링크
  FILE            // 3: 파일
}

enum AdminRole {
  SUPER_ADMIN     // 1: 슈퍼관리자
  MANAGER         // 2: 매니저
  STAFF           // 3: 스태프
}

// ============================================================
// MODELS
// ============================================================

/// 파트너사/대리점
model Supplier {
  id                Int           @id @default(autoincrement())
  status            ContentStatus @default(DRAFT)
  kind              SupplierKind
  code              String?       @db.VarChar(50)
  name              String        @db.VarChar(255)
  nameKana          String?       @db.VarChar(255) @map("name_kana")
  zipcode           String?       @db.VarChar(10)
  prefecture        Int?          @db.SmallInt     // 1~47
  address1          String?       @db.VarChar(500)
  address2          String?       @db.VarChar(500)
  tel               String?       @db.VarChar(20)
  fax               String?       @db.VarChar(20)
  // 사업 정보
  systemResidential Int?          @db.SmallInt @map("system_residential")
  systemLowVoltage  Int?          @db.SmallInt @map("system_low_voltage")
  systemIndustrial  Int?          @db.SmallInt @map("system_industrial")
  handlingStatus    Boolean?      @map("handling_status")
  conditions        String?       @db.VarChar(100)
  foundationYear    Int?          @db.SmallInt @map("foundation_year")
  foundationMonth   Int?          @db.SmallInt @map("foundation_month")
  prefArea          String?       @db.Text @map("pref_area")
  // 관계
  users             User[]
  // 타임스탬프
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  @@map("suppliers")
}

/// 사용자
model User {
  id                Int           @id @default(autoincrement())
  status            UserStatus    @default(PENDING)
  division          UserDivision  @default(GENERAL)
  isAdmin           Boolean       @default(false) @map("is_admin")
  isSalesAccount    Boolean       @default(false) @map("is_sales_account")
  // 인증
  email             String        @unique @db.VarChar(255)
  passwordHash      String        @db.VarChar(255) @map("password_hash")
  passwordChangedAt DateTime?     @map("password_changed_at")
  // 개인정보
  lastName          String        @db.VarChar(100) @map("last_name")
  firstName         String        @db.VarChar(100) @map("first_name")
  lastNameKana      String?       @db.VarChar(100) @map("last_name_kana")
  firstNameKana     String?       @db.VarChar(100) @map("first_name_kana")
  companyName       String?       @db.VarChar(255) @map("company_name")
  companyNameKana   String?       @db.VarChar(255) @map("company_name_kana")
  branchOffice      String?       @db.VarChar(255) @map("branch_office")
  zipcode           String?       @db.VarChar(10)
  prefecture        Int?          @db.SmallInt
  address1          String?       @db.VarChar(500)
  address2          String?       @db.VarChar(500)
  tel               String?       @db.VarChar(20)
  fax               String?       @db.VarChar(20)
  facePhotoUrl      String?       @db.VarChar(500) @map("face_photo_url")
  // 그룹/분류
  groupKind         GroupKind?    @map("group_kind")
  hqjDepartment     Int?          @db.SmallInt @map("hqj_department")
  hasExtraAuth      Boolean       @default(false) @map("has_extra_auth")
  // 메일 설정
  mailEnabled       Boolean       @default(true) @map("mail_enabled")
  mailMagEnabled    Boolean       @default(true) @map("mail_mag_enabled")
  // 관계
  supplierId        Int?          @map("supplier_id")
  supplier          Supplier?     @relation(fields: [supplierId], references: [id])
  assignedStaffId   Int?          @map("assigned_staff_id")
  assignedStaff     AdminUser?    @relation(fields: [assignedStaffId], references: [id])
  certifications    UserCertification[]
  downloadLogs      DownloadLog[]
  newsViewLogs      NewsViewLog[]
  // Soft delete & 타임스탬프
  withdrawnAt       DateTime?     @map("withdrawn_at")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  @@index([supplierId])
  @@index([status])
  @@index([groupKind])
  @@map("users")
}

/// 사용자 자격증/인증 (시공ID, 델타ID 등 - 확장 가능)
model UserCertification {
  id                Int           @id @default(autoincrement())
  userId            Int           @map("user_id")
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  certType          CertType      @map("cert_type")
  certId            String?       @db.VarChar(100) @map("cert_id")
  sekoKind          SekoKind?     @map("seko_kind")
  status            CertStatus    @default(VALID)
  issuedAt          DateTime?     @map("issued_at")
  expiresAt         DateTime?     @map("expires_at")
  renewalDeadline   DateTime?     @map("renewal_deadline")
  certificateUrl    String?       @db.VarChar(500) @map("certificate_url")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  @@unique([userId, certType])
  @@index([certType, status])
  @@map("user_certifications")
}

/// 사전등록 (임시)
model UserPreEntry {
  id                Int           @id @default(autoincrement())
  uniqueId          String        @unique @db.VarChar(100) @map("unique_id")
  email             String        @db.VarChar(255)
  createdAt         DateTime      @default(now()) @map("created_at")
  expiresAt         DateTime      @map("expires_at")

  @@index([email])
  @@map("user_pre_entries")
}

/// 카테고리 (문서/뉴스 공용 - self-relation 트리)
model Category {
  id                Int           @id @default(autoincrement())
  parentId          Int?          @map("parent_id")
  parent            Category?     @relation("CategoryTree", fields: [parentId], references: [id])
  children          Category[]    @relation("CategoryTree")
  targetType        String        @db.VarChar(20) @map("target_type")
  code              String        @db.VarChar(20)
  name              String        @db.VarChar(255)
  level             Int           @db.SmallInt @default(1)
  sortOrder         Int           @default(0) @map("sort_order")
  summary           String?       @db.Text
  thumbnailUrl      String?       @db.VarChar(500) @map("thumbnail_url")
  colorBg           String?       @db.VarChar(7) @map("color_bg")
  colorText         String?       @db.VarChar(7) @map("color_text")
  isActive          Boolean       @default(true) @map("is_active")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")
  // 관계
  documents         DocumentCategory[]
  news              NewsCategory[]

  @@unique([targetType, code])
  @@index([parentId])
  @@index([targetType, isActive])
  @@map("categories")
}

/// 문서/자료
model Document {
  id                Int              @id @default(autoincrement())
  status            ContentStatus    @default(DRAFT)
  approvalStatus    ApprovalStatus?  @map("approval_status")
  title             String           @db.VarChar(500)
  titleKana         String?          @db.VarChar(500) @map("title_kana")
  fileUrl           String?          @db.VarChar(500) @map("file_url")
  revisionDate      DateTime?        @map("revision_date") @db.Date
  isNew             Boolean          @default(false) @map("is_new")
  isSearchable      Boolean          @default(true) @map("is_searchable")
  isPublicAccess    Boolean          @default(false) @map("is_public_access")
  searchKeywords    String?          @db.Text @map("search_keywords")
  // 관계
  categories        DocumentCategory[]
  visibilities      ContentVisibility[] @relation("DocumentVisibility")
  downloadLogs      DownloadLog[]
  // 등록/수정 추적
  createdById       Int?             @map("created_by_id")
  updatedById       Int?             @map("updated_by_id")
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  @@index([status])
  @@index([isSearchable, status])
  @@map("documents")
}

/// 문서-카테고리 (N:M)
model DocumentCategory {
  documentId        Int              @map("document_id")
  document          Document         @relation(fields: [documentId], references: [id], onDelete: Cascade)
  categoryId        Int              @map("category_id")
  category          Category         @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  sortOrder         Int              @default(0) @map("sort_order")

  @@id([documentId, categoryId])
  @@map("document_categories")
}

/// 뉴스
model News {
  id                Int              @id @default(autoincrement())
  status            ContentStatus    @default(DRAFT)
  approvalStatus    ApprovalStatus?  @map("approval_status")
  type              NewsType         @default(PAGE)
  title             String           @db.VarChar(500)
  description       String?          @db.Text
  keywords          String?          @db.VarChar(500)
  publishedDate     DateTime         @map("published_date") @db.Date
  // 콘텐츠 (type에 따라 사용)
  content           String?          @db.Text
  externalUrl       String?          @db.VarChar(500) @map("external_url")
  openInNewWindow   Boolean          @default(false) @map("open_in_new_window")
  fileUrl           String?          @db.VarChar(500) @map("file_url")
  thumbnailUrl      String?          @db.VarChar(500) @map("thumbnail_url")
  thumbnailAlt      String?          @db.VarChar(255) @map("thumbnail_alt")
  searchKeywords    String?          @db.Text @map("search_keywords")
  // 관계
  categories        NewsCategory[]
  visibilities      ContentVisibility[] @relation("NewsVisibility")
  viewLogs          NewsViewLog[]
  // 등록/수정 추적
  createdById       Int?             @map("created_by_id")
  updatedById       Int?             @map("updated_by_id")
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  @@index([status, publishedDate])
  @@index([type])
  @@map("news")
}

/// 뉴스-카테고리 (N:M)
model NewsCategory {
  newsId            Int              @map("news_id")
  news              News             @relation(fields: [newsId], references: [id], onDelete: Cascade)
  categoryId        Int              @map("category_id")
  category          Category         @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  sortOrder         Int              @default(0) @map("sort_order")

  @@id([newsId, categoryId])
  @@map("news_categories")
}

/// 콘텐츠 공개기간 (그룹별) - Document, News 공용
/// AS-IS의 st_time_1~3, delta 컬럼을 정규화
/// 그룹 추가 시 GroupKind enum에 값만 추가하면 됨
model ContentVisibility {
  id                Int              @id @default(autoincrement())
  // Document 또는 News 중 하나만 연결
  documentId        Int?             @map("document_id")
  document          Document?        @relation("DocumentVisibility", fields: [documentId], references: [id], onDelete: Cascade)
  newsId            Int?             @map("news_id")
  news              News?            @relation("NewsVisibility", fields: [newsId], references: [id], onDelete: Cascade)
  // 공개 대상 그룹
  groupKind         GroupKind        @map("group_kind")
  // 공개 기간
  startsAt          DateTime?        @map("starts_at")
  endsAt            DateTime?        @map("ends_at")

  @@unique([documentId, groupKind])
  @@unique([newsId, groupKind])
  @@index([groupKind, startsAt, endsAt])
  @@map("content_visibilities")
}

/// 문서 다운로드 이력
model DownloadLog {
  id                Int              @id @default(autoincrement())
  userId            Int              @map("user_id")
  user              User             @relation(fields: [userId], references: [id])
  documentId        Int              @map("document_id")
  document          Document         @relation(fields: [documentId], references: [id])
  downloadedAt      DateTime         @default(now()) @map("downloaded_at")

  @@index([userId])
  @@index([documentId])
  @@index([downloadedAt])
  @@map("download_logs")
}

/// 뉴스 열람 이력
model NewsViewLog {
  id                Int              @id @default(autoincrement())
  userId            Int              @map("user_id")
  user              User             @relation(fields: [userId], references: [id])
  newsId            Int              @map("news_id")
  news              News             @relation(fields: [newsId], references: [id])
  viewedAt          DateTime         @default(now()) @map("viewed_at")

  @@index([userId])
  @@index([newsId])
  @@index([viewedAt])
  @@map("news_view_logs")
}

/// 관리자
model AdminUser {
  id                Int              @id @default(autoincrement())
  role              AdminRole        @default(STAFF)
  isEnabled         Boolean          @default(true) @map("is_enabled")
  isRetired         Boolean          @default(false) @map("is_retired")
  name              String           @db.VarChar(255)
  email             String           @unique @db.VarChar(255)
  passwordHash      String           @db.VarChar(255) @map("password_hash")
  profileImageUrl   String?          @db.VarChar(500) @map("profile_image_url")
  lastActiveAt      DateTime?        @map("last_active_at")
  failedLoginCount  Int              @default(0) @map("failed_login_count")
  lockedUntil       DateTime?        @map("locked_until")
  // 관계
  assignedUsers     User[]
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  @@map("admin_users")
}
```

### 2.4 AS-IS → TO-BE 매핑

| AS-IS 테이블 | TO-BE 모델 | 주요 변경점 |
|-------------|-----------|------------|
| M_USER | User | email unique, bcrypt, enum 상태, FK 명시 |
| M_USER (seko_*, delta_*) | UserCertification | 자격증 정보를 별도 테이블로 분리 |
| M_USER_PRE_ENTRY | UserPreEntry | 만료시간 추가 |
| M_SUPPLIER | Supplier | enum kind, 적절한 varchar 타입 |
| M_DOCUMENT | Document | 그룹별 공개기간 정규화(ContentVisibility) |
| M_NEWS | News | enum type, 그룹별 공개기간 정규화 |
| M_CATEGORY | Category | self-relation 트리, plugin→targetType |
| R_DATA (User↔Supplier) | User.supplierId | 직접 FK로 변환 |
| R_DATA (Doc↔Category) | DocumentCategory | 명시적 조인 테이블 |
| R_DATA (News↔Category) | NewsCategory | 명시적 조인 테이블 |
| R_HISTORY | DownloadLog | FK 참조, 비정규화 제거 |
| R_HISTORY_NEWS | NewsViewLog | FK 참조, 비정규화 제거 |
| A_STAFF | AdminUser | enum role, 계정 잠금 개선 |
| A_SITE | _(환경변수/설정파일로 이관)_ | DB에서 제거 |
| st_time_1~3, delta | ContentVisibility | 하드코딩 → 정규화 테이블 |

### 2.5 TO-BE 개선 사항 요약

| # | 개선 항목 | AS-IS | TO-BE |
|---|----------|-------|-------|
| 1 | DB 엔진 | MyISAM/InnoDB 혼용 | InnoDB 통일 |
| 2 | 비밀번호 | text (평문/MD5 추정) | bcrypt hash (VarChar(255)) |
| 3 | 관계 | R_DATA 범용 테이블 | 명시적 FK + 조인 테이블 |
| 4 | 그룹 공개기간 | 8개 컬럼 하드코딩 | ContentVisibility 정규화 (DELTA 포함) |
| 5 | 자격증 | M_USER에 seko/delta 혼재 | UserCertification 분리 (신규 인증 추가 용이) |
| 6 | 데이터 타입 | text 남용 | varchar(적절한 길이) |
| 7 | 인덱스 | 거의 없음 | 주요 검색/FK에 인덱스 |
| 8 | Soft Delete | status='4' (탈퇴) | withdrawn_at + enum |
| 9 | 이력 테이블 | user_name/title 중복 | FK 참조만 (JOIN으로 조회) |
| 10 | 카테고리 | full_code 문자열 계층 | self-relation (parentId) |
| 11 | 사이트 설정 | DB 테이블 (A_SITE) | 환경변수/설정파일 |

---

## 3. 데이터 마이그레이션 전략

### 3.1 마이그레이션 순서

```
1. Supplier (독립)
2. AdminUser (독립)
3. Category (독립, self-relation)
4. User (FK: Supplier, AdminUser)
5. UserCertification (FK: User)
6. Document (독립)
7. DocumentCategory (FK: Document, Category)
8. News (독립)
9. NewsCategory (FK: News, Category)
10. ContentVisibility (FK: Document, News) ← st_time_1~3, delta 변환
11. DownloadLog (FK: User, Document)
12. NewsViewLog (FK: User, News)
```

### 3.2 주요 변환 로직

**그룹별 공개기간 변환 (M_DOCUMENT/M_NEWS → ContentVisibility):**
```
st_time_1/ed_time_1 → ContentVisibility { groupKind: A, startsAt, endsAt }
st_time_2/ed_time_2 → ContentVisibility { groupKind: B, startsAt, endsAt }
st_time_3/ed_time_3 → ContentVisibility { groupKind: C, startsAt, endsAt }
st_time_delta/ed_time_delta → ContentVisibility { groupKind: DELTA, startsAt, endsAt }
```

**R_DATA → 명시적 관계 변환:**
```
R_DATA(plugin='User', relation='Supplier') → User.supplierId = R_DATA.relation_id
R_DATA(plugin='Document', relation='Category') → DocumentCategory(documentId, categoryId)
R_DATA(plugin='News', relation='Category') → NewsCategory(newsId, categoryId)
```

**M_USER 자격증 분리:**
```
M_USER.seko_* → UserCertification { certType: SEKO, certId: seko_id, sekoKind, status, issuedAt, expiresAt, renewalDeadline }
M_USER.delta_* → UserCertification { certType: DELTA, certId: delta_id, status, issuedAt }
```

**M_USER 상태 변환:**
```
status='1' → ACTIVE
status='2' → INACTIVE
status='3' → PENDING
status='4' → WITHDRAWN (+ withdrawnAt = unsubscribe_date)
status='5' → WEB_SEMINAR
```
