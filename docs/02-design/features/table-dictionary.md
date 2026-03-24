# Q.PARTNERS 테이블 정의서 (리뷰용)

> **Project**: Q.Partners 리뉴얼 (qpartners-neo)
> **기준 문서**: 화면설계서 v1.0 (260323)
> **DB 정본**: `prisma/schema.prisma`
> **Date**: 2026-03-24
> **Status**: Review

---

## 개요

Q.PARTNERS 시스템의 전체 테이블 구조를 설명합니다.
**사용자 마스터 데이터는 QSP에 저장**하고, TO-BE Q.Partners-neo는 **서비스 운영 테이블(18개)**만 관리합니다.

### 아키텍처 요약

```
QSP (사용자 마스터)
├── 기존 사용자 (사내회원, 판매점)
├── qp_general_users — 일반회원 인적/법인정보 (신규 생성)
└── qp_info — 모든 사용자의 QP 서비스 설정 (신규 생성)
       │
       │ I/F (API 연동)
       ▼
TO-BE Q.Partners-neo (서비스 운영)
├── 권한/메뉴 (4개): qp_roles, qp_role_menu_permissions, qp_menus, qp_code_*
├── 콘텐츠 (5개): qp_contents, qp_content_targets, qp_categories, qp_content_categories, qp_content_attachments
├── 인증 (2개): qp_password_reset_tokens, qp_two_factor_codes
└── 관리 (7개): qp_home_notices, qp_mass_mails, qp_mass_mail_recipients, qp_mass_mail_attachments, qp_download_logs, qp_inquiries
```

---

## QSP 측 테이블 (2개) — TO-BE DB에 생성하지 않음

> QSP DB에 존재하며, I/F를 통해 접근합니다.
> TO-BE Q.Partners-neo는 자체 DB에 사용자 정보를 저장하지 않습니다.

### 1. qp_general_users (일반회원 사용자)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 홈페이지에서 직접 가입하는 일반회원의 인적정보+법인정보를 저장. QSP 기존 테이블(사내회원/판매점)에는 일반회원 개념이 없으므로 신규 생성 필요 |
| **화면 근거** | 회원가입 (p.16-18), 내정보/회사정보 수정 (p.34) |
| **대상** | 일반회원 (Cus4) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| company_name | VARCHAR(255) | 회사명 (필수) | 회원가입 > 법인정보 (p.16) |
| company_name_kana | VARCHAR(255) | 회사명 히라가나 (필수) | 회원가입 > 법인정보 (p.16) |
| zipcode | VARCHAR(10) | 우편번호, 7자리 (필수) | 회원가입 > 우편번호찾기 연동 (p.16) |
| address1 | VARCHAR(500) | 주소 (도도부현+시구정촌) (필수) | 회원가입 > 주소 (p.16) |
| address2 | VARCHAR(500) | 주소 상세 (빌딩명 등) | 회원가입 > 주소 (p.16) |
| tel | VARCHAR(20) | 전화번호, 000-0000-0000 (필수) | 회원가입 > 전화번호 (p.16) |
| fax | VARCHAR(20) | FAX번호 | 회원가입 > FAX번호 (p.16), 판매점은 필수/일반은 선택 |
| corporate_number | VARCHAR(20) | 법인번호 | 내정보수정 (p.34 #2), 일반회원은 숨김, 판매점/관리자만 표시 |
| last_name | VARCHAR(100) | 성 (필수) | 회원가입 > 회원정보 (p.16) |
| first_name | VARCHAR(100) | 이름 (필수) | 회원가입 > 회원정보 (p.16) |
| last_name_kana | VARCHAR(100) | 성 히라가나 (필수) | 회원가입 > 회원정보 (p.16) |
| first_name_kana | VARCHAR(100) | 이름 히라가나 (필수) | 회원가입 > 회원정보 (p.16) |
| email | VARCHAR(255) | 이메일 = 로그인 ID (필수, 유니크) | 회원가입 > 이메일(ID), 중복체크 필수 (p.16) |
| password_hash | VARCHAR(255) | 비밀번호 해시 (bcrypt) | 회원가입 > 비밀번호, 영문/숫자/기호 2종 조합 8자 이상 (p.16) |
| department | VARCHAR(100) | 부서명 (선택) | 회원가입 > 부서명 (p.16), 시공점은 미노출 (260323 변경) |
| job_title | VARCHAR(100) | 직책 (선택) | 회원가입 > 직책 (p.16), 시공점은 미노출 (260323 변경) |
| created_at | DATETIME | 등록일시 | - |
| updated_at | DATETIME | 수정일시 | - |

---

### 2. qp_info (QPartners 사용자 설정 정보)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | QSP의 **모든 사용자 테이블**(기존 사내회원, 판매점, 신규 일반회원)과 user_id로 join하여, QPartners 서비스에서만 필요한 설정(권한, 2차인증, 알림, 약관동의 등)을 통합 관리. 인적정보와 서비스 설정을 분리하여 QSP 측 스키마에 미치는 영향을 최소화 |
| **화면 근거** | 회원관리 (p.41-42), 로그인 (p.9-10), 2차인증 (p.14), 최초로그인 설정 (p.13) |
| **대상** | 전체 회원 (사내+판매점+일반, user_source로 구분) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| user_source | ENUM('qsp','seko','general') | 사용자 소스 구분 | 3탭 로그인 구조에 따른 사용자 분류 (p.9-10) |
| user_id | VARCHAR(255) | 소스별 사용자 식별자 | qsp=QSP사용자ID, seko=AS-IS M_USER.id, general=qp_general_users.id |
| user_type | VARCHAR(20) | 회원유형 (관리자/판매점/일반) | 회원관리 목록 > 회원유형 (p.41) |
| user_role | VARCHAR(50) | 사용자 권한 코드 | 회원관리 상세 > 사용자권한 드롭다운 (p.42 #3), 일반회원만 변경 가능 |
| two_factor_enabled | BOOLEAN | 2차인증 유효/무효 | 회원관리 상세 (p.42 #5), 디폴트: 전원 유효 |
| two_factor_verified_at | DATETIME? | 최근 2차인증 완료 일시 | 2차인증 팝업 (p.14), 인증 만료 판단에 사용 |
| login_notification | BOOLEAN | 로그인 알림받기 유효/무효 | 회원관리 상세 (p.42 #6), 디폴트: 관리자=무효, 외부회원=유효 |
| attribute_change_notification | BOOLEAN | 속성변경 알림받기 유효/무효 | 회원관리 상세 (p.42 #7), 마이페이지 정보 변경 시 알림메일 발송 |
| status | ENUM('active','deleted') | 회원상태 | 회원관리 상세 (p.42 #8), Active=로그인가능, Delete=불가 |
| withdrawn | BOOLEAN | 탈퇴 여부 Y/N | 회원관리 목록 > 탈퇴여부 (p.41) |
| withdrawn_at | DATETIME? | 탈퇴 일시 | 회원관리 상세 (p.42 #9), 마이페이지 탈퇴 시 기록 (p.36) |
| withdrawn_reason | TEXT? | 탈퇴 사유 | 회원관리 상세 (p.42 #9) |
| last_login_at | DATETIME? | 최근 접속 일시 | 회원관리 목록/상세 > 최근접속일시 (p.41, p.42) |
| terms_agreed_at | DATETIME? | 이용약관 동의 일시 | 로그인 > "이용약관 동의 필수 (보기)" (p.9) |
| initial_setup_done | BOOLEAN | 최초로그인 설정 완료 여부 | 최초로그인 후 개인정보 설정 팝업 (p.13) |
| password_changed_at | DATETIME? | 비밀번호 변경 일시 | 비밀번호 변경 (p.35), 최초로그인 설정 (p.13) |
| id_save_enabled | BOOLEAN | ID Save 기능 활성화 | 로그인 > ID Save 체크박스 (p.9 #3) |
| created_at | DATETIME | 등록일 | 회원관리 상세 (p.42 #1) |
| updated_at | DATETIME | 수정일시 | 회원관리 상세 (p.42 #1) |
| updated_by | VARCHAR(255)? | 수정자 | 회원관리 상세 (p.42 #1) |

---

## TO-BE QPartners 테이블 (18개)

### ━━━ 권한/메뉴 관련 (4개) ━━━

### 3. qp_roles (권한 정의)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | Q.PARTNERS의 7단계 권한 체계(SuperADMIN~비회원)를 정의. 각 권한별로 접근 가능한 메뉴와 CRUD 범위가 다르므로, 권한 정보를 별도 테이블로 관리하여 메뉴별 접근제어의 기준 제공 |
| **화면 근거** | 권한관리 (p.49) |
| **초기 데이터** | 7개 (SuperADMIN, ADMIN, Cus1~Cus5) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| role_code | VARCHAR(50) UNIQUE | 권한코드 (수정 불가) | 권한관리 (p.49), 예: SuperADMIN, ADMIN, Cus1~5 |
| role_name | VARCHAR(100) | 권한명 (수정 가능) | 권한관리 (p.49), 예: 슈퍼관리자, 관리자, 1차점 |
| description | VARCHAR(500)? | 권한 설명 | 권한관리 (p.49), 권한의 용도/대상 설명 |
| is_active | BOOLEAN | 사용 여부 Y/N | 권한관리 (p.49 #3), 비활성화 시 해당 권한으로 접근 불가 |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

---

### 4. qp_role_menu_permissions (역할별 메뉴 CRUD 권한)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 권한(Role)별로 각 메뉴에 대해 Read/Create/Update/Delete 중 어떤 조작이 허용되는지 개별 설정. 화면설계서의 "Available Menu Setting" 팝업(p.50)에서 권한별 메뉴 접근제어를 체크박스로 설정하는 기능의 저장소 |
| **화면 근거** | 권한관리 > Available Menu Setting 팝업 (p.50) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| role_code | VARCHAR(50) FK | 권한코드 → qp_roles.role_code | 어떤 권한에 대한 설정인지 (p.50) |
| menu_code | VARCHAR(50) FK | 메뉴코드 → qp_menus.menu_code | 어떤 메뉴에 대한 설정인지 (p.50) |
| can_read | BOOLEAN | 조회 권한 | Menu Setting 팝업 > Read 체크박스 (p.50) |
| can_create | BOOLEAN | 등록 권한 | Menu Setting 팝업 > Create 체크박스 (p.50) |
| can_update | BOOLEAN | 수정 권한 | Menu Setting 팝업 > Update 체크박스 (p.50) |
| can_delete | BOOLEAN | 삭제 권한 | Menu Setting 팝업 > Delete 체크박스 (p.50) |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

**복합 유니크**: `(role_code, menu_code)` — 동일 권한+메뉴 조합은 하나만 존재

---

### 5. qp_menus (메뉴관리)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | Q.PARTNERS의 GNB/모바일 메뉴 구조를 DB로 관리. 2레벨 트리 구조(1-Level: 통합검색/콘텐츠/마이페이지/관리자, 2-Level: 하위 메뉴)로 구성. 정렬순서, PC/모바일 노출 여부, 사용 여부를 관리자가 동적으로 제어 |
| **화면 근거** | 관리자 > 메뉴관리 (p.51) |
| **초기 데이터** | 1-Level 4개 + 2-Level 10개 = 14개 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| parent_id | INT? FK(self) | 상위 메뉴 ID (NULL=1-Level) | 메뉴관리 > 2-Level 메뉴 구조 (p.51) |
| menu_code | VARCHAR(50) UNIQUE | 메뉴코드 (수정 불가) | 메뉴관리 (p.51), 예: CONTENTS, MYPAGE, ADMIN |
| menu_name | VARCHAR(100) | 메뉴명 | 메뉴관리 (p.51), GNB에 표시되는 이름 |
| page_url | VARCHAR(500)? | 페이지 URL | 해당 메뉴 클릭 시 이동할 경로 |
| is_active | BOOLEAN | 사용 여부 Y/N | 메뉴관리 (p.51), 비활성화 시 메뉴에서 숨김 |
| show_in_top_nav | BOOLEAN | Top 메뉴 노출 | 메뉴관리 (p.51), PC GNB 표시 여부 |
| show_in_mobile | BOOLEAN | 모바일 메뉴 노출 | 메뉴관리 (p.51), 모바일 하단 메뉴 표시 여부 |
| sort_order | INT | 정렬 순서 | 메뉴관리 (p.51), 같은 레벨 내 표시 순서 |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

---

### ━━━ 콘텐츠 관련 (5개) ━━━

### 6. qp_contents (콘텐츠)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | Q.PARTNERS의 핵심 기능. AS-IS에서 4개 테이블(M_NEWS, M_DOCUMENT, M_MOVIE, M_PRODUCT)로 분산된 콘텐츠를 하나의 통합 테이블로 관리. 관리정보(담당자/부문)+본문+상태+조회수를 저장 |
| **화면 근거** | 콘텐츠 목록 (p.22-24), 등록 (p.25-27), 조회 (p.28-29), 수정 (p.30-31) |
| **AS-IS 대비** | M_NEWS + M_DOCUMENT + M_MOVIE + M_PRODUCT → 통합 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| author_source | ENUM(UserSource) | 게재담당자의 사용자 소스 (qsp/seko/general) | 3탭 로그인 구조에 따른 사용자 분류 |
| author_id | VARCHAR(255) | 게재담당자 ID | 콘텐츠 등록 > "게재 담당자" (p.25 #1, read only, 등록자명 자동) |
| author_department | VARCHAR(100)? | 담당부문 | 콘텐츠 등록 > "담당부문" (p.25 #5, read only), 등록자의 부서값 자동 적용 (p.27 Description). 저장 시점 값 유지 |
| updater_source | ENUM(UserSource)? | 갱신담당자의 사용자 소스 | 수정 시 갱신자 추적 |
| updater_id | VARCHAR(255)? | 갱신담당자 ID | 콘텐츠 등록 > "갱신담당자" (p.25 #3), 저장할 때마다 자동 업데이트 (p.30) |
| approver_level | TINYINT? | 최종승인자 레벨 | 콘텐츠 등록 > "최종승인자 *" 드롭다운 (p.25 #6), 1=담당/2=소속장/3=사업부장/4=사장 |
| title | VARCHAR(500) | 제목 (필수) | 콘텐츠 등록 > "제목 *" (p.26 #11) |
| body | MEDIUMTEXT? | 내용 (에디터 적용) | 콘텐츠 등록 > "내용 *" (p.26 #12), WYSIWYG 에디터 HTML 저장 |
| status | ENUM(ContentStatus) | 상태: draft/published/deleted | draft=임시저장, published=게시, deleted=삭제 |
| published_at | DATETIME? | 게재일 | 콘텐츠 등록 > "게재일" (p.25 #2, read only, Today), 게시 시점 기록 |
| created_at | DATETIME | 등록일 | 콘텐츠 목록 > "등록일" (p.23 #6) |
| updated_at | DATETIME | 갱신일 | 콘텐츠 목록 > "갱신일" (p.23 #7) |
| view_count | INT | 조회수 | 콘텐츠 상세 > "조회 1,000" (p.28 #1), 상세 페이지 조회 시 +1 |

**인덱스**: status, published_at, created_at, (author_source+author_id), author_department, (status+published_at)

---

### 7. qp_content_targets (게시대상)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 하나의 콘텐츠가 여러 대상(1차점, 2차점이하, 시공점, 일반회원, 비회원)에게 각각 다른 기간으로 게시될 수 있음. 대상×기간 조합이 N개이므로 별도 테이블로 분리 |
| **화면 근거** | 콘텐츠 등록 > 게시대상 체크박스 + 기간설정 (p.25 #7, #8) |
| **비즈니스 규칙** | 사내회원(슈퍼관리자+관리자)은 게시대상과 관계없이 항상 조회 가능 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| content_id | INT FK | 콘텐츠 ID → qp_contents.id | 어떤 콘텐츠의 게시대상인지 |
| target_type | ENUM(TargetType) | 게시대상 유형 | 콘텐츠 등록 > 게시대상 체크박스 (p.25 #7): first_dealer=1차점, second_dealer=2차이하, constructor=시공점, general=일반회원, non_member=비회원 |
| start_at | DATETIME? | 게시 시작일 | 콘텐츠 등록 > 게시대상 기간설정 (p.25 #8), NULL=시작일 제한 없음 |
| end_at | DATETIME? | 게시 종료일 | 콘텐츠 등록 > 게시대상 기간설정 (p.25 #8), NULL=종료일 제한 없음 |

**FK**: content_id → qp_contents.id (CASCADE DELETE)

---

### 8. qp_categories (카테고리)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 콘텐츠 분류를 위한 2Depth 트리형 카테고리. 8개 대분류(정보유형/업무분류/제품분류/제품상태/용도/내용분류/자료분류/대상) 아래 소분류를 관리. 콘텐츠 검색 필터와 등록 시 분류 선택에 사용 |
| **화면 근거** | 카테고리 관리 (p.48), 콘텐츠 검색조건 (p.24), 콘텐츠 등록 (p.25-26) |
| **비즈니스 규칙** | 1Depth 코드는 수동입력, 2Depth 코드는 자동채번. 코드/상위카테고리는 수정 불가 (p.48) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| parent_id | INT? FK(self) | 상위 카테고리 ID (NULL=1Depth) | 2Depth 트리 구조 (p.48 #8), 수정 불가 |
| category_code | VARCHAR(50) UNIQUE | 카테고리 코드 (수정 불가) | 카테고리 관리 (p.48 #10), 1Depth=수동입력, 2Depth=자동채번 |
| name | VARCHAR(100) | 카테고리명 (필수) | 카테고리 관리 (p.48 #10), 예: 정보유형, 업무분류, 태양광모듈 |
| is_internal_only | BOOLEAN | 사내회원 전용 Y/N | 카테고리 관리 (p.48 #9), "사내전용"은 빨간색 표시, 권한자에게만 노출 |
| sort_order | INT | 표시 순서 | 카테고리 관리 (p.48 #10), 같은 Depth 내 정렬 |
| is_active | BOOLEAN | 사용 여부 Y/N | 카테고리 관리 (p.48 #10), 비활성화 시 검색/등록 화면에서 숨김 |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

---

### 9. qp_content_categories (콘텐츠-카테고리 연결)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 하나의 콘텐츠에 여러 카테고리를 태그처럼 지정(N:M). 콘텐츠 등록 시 8개 대분류별로 소분류를 체크박스로 선택하는 구조이므로 다대다 연결 테이블이 필요 |
| **화면 근거** | 콘텐츠 등록 > 카테고리 선택 (p.25-26), 콘텐츠 상세 > 카테고리 태그 표시 (p.28) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| content_id | INT PK/FK | 콘텐츠 ID → qp_contents.id | 복합 PK의 일부 |
| category_id | INT PK/FK | 카테고리 ID → qp_categories.id | 복합 PK의 일부 |

**복합 PK**: `(content_id, category_id)` — 양쪽 모두 CASCADE DELETE

---

### 10. qp_content_attachments (콘텐츠 첨부파일)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 콘텐츠에 첨부되는 파일(PDF, 이미지 등)의 메타정보를 관리. 콘텐츠 등록 시 D&D로 첨부, 상세 조회 시 미리보기(PDF/이미지) 및 전체 zip 다운로드 기능 제공 |
| **화면 근거** | 콘텐츠 등록 > 파일첨부 D&D (p.27 #13), 상세 > 미리보기/다운로드 (p.29 #11, #12) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| content_id | INT FK | 콘텐츠 ID → qp_contents.id | 어떤 콘텐츠의 첨부파일인지 |
| file_name | VARCHAR(255) | 원본 파일명 | 상세 화면에서 파일명 표시 (p.29 #11) |
| file_path | VARCHAR(500) | 서버 저장 경로 | 다운로드/미리보기 시 파일 접근 경로 |
| file_size | BIGINT? | 파일 크기 (bytes) | 상세 화면에서 파일 크기 표시 |
| mime_type | VARCHAR(100)? | MIME 타입 | PDF/이미지 미리보기 판단 (p.29 #12): PDF→뷰어, 이미지→썸네일 |
| sort_order | INT | 표시 순서 | 첨부파일 목록 내 정렬 |
| created_at | DATETIME | 업로드 일시 | - |

**FK**: content_id → qp_contents.id (CASCADE DELETE)

---

### ━━━ 인증 관련 (2개) ━━━

### 11. qp_password_reset_tokens (비밀번호 초기화 토큰)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 비밀번호 초기화 요청 시 일회용 토큰을 생성하여 이메일로 변경 링크 발송. 토큰의 유효기간과 사용 여부를 추적하여 보안을 확보. 시간 경과 후 만료 처리 |
| **화면 근거** | 비밀번호 초기화 팝업 (p.11), 비밀번호 변경 링크 메일 (p.12) |
| **프로세스** | 초기화 요청 → 토큰 생성 → 이메일 발송 → 링크 클릭 → 토큰 검증 → 비밀번호 변경 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| user_source | ENUM(UserSource) | 사용자 소스 (qsp/seko/general) | 회원유형별 비밀번호 초기화 입력 차별화 (p.11) |
| external_user_id | VARCHAR(255) | 소스별 사용자 식별자 | user_source와 조합하여 대상 사용자 특정 |
| token | VARCHAR(255) UNIQUE | 일회용 토큰 (URL-safe) | 비밀번호 변경 링크에 포함되는 보안 토큰 |
| expires_at | DATETIME | 토큰 만료 일시 | 보안상 제한 시간 설정 |
| used | BOOLEAN | 사용 완료 여부 | 일회성 보장, 사용 후 재사용 불가 |
| created_at | DATETIME | 생성 일시 | - |

---

### 12. qp_two_factor_codes (2차 인증 코드)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 로그인 시 2차 인증이 활성화된 사용자에게 이메일로 6자리 인증번호를 발송하고, 10분 이내에 입력하여 검증. 인증 코드의 생성/만료/검증 이력을 관리 |
| **화면 근거** | 2차인증 팝업 (p.14), 2단계 인증 알림메일 (p.15) |
| **프로세스** | 로그인 성공 → 2차인증 필요 판단 → 6자리 코드 생성 → 이메일 발송 → 10분 내 입력 → 검증 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| user_source | ENUM(UserSource) | 사용자 소스 (qsp/seko/general) | 대상 사용자 식별 |
| external_user_id | VARCHAR(255) | 소스별 사용자 식별자 | user_source와 조합하여 대상 사용자 특정 |
| code | VARCHAR(6) | 인증번호 6자리 | 2차인증 팝업 > 인증번호 입력란 (p.14), 숫자 6자리 |
| expires_at | DATETIME | 만료 일시 | 10분 제한 (p.14), 초과 시 재전송 필요 |
| verified | BOOLEAN | 인증 완료 여부 | 인증번호 검증 성공 시 true |
| created_at | DATETIME | 생성 일시 | - |

---

### ━━━ 관리자 운영 관련 (7개) ━━━

### 13. qp_home_notices (홈화면 공지)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 홈화면 상단에 권한별/기간별로 표시되는 공지사항을 관리. 최대 5개까지 동시 표시 가능. 게시대상(6개 권한)별로 체크박스 선택, 시작/종료일로 자동 노출 제어 |
| **화면 근거** | 홈화면 공지관리 (p.46-47) |
| **비즈니스 규칙** | 최대 5개 동시 표시, 텍스트+하이퍼링크, 기간에 따라 scheduled→active→ended 자동 전환 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| target_super_admin | BOOLEAN | 슈퍼관리자 대상 여부 | 공지관리 > 게시대상 체크박스 (p.46) |
| target_admin | BOOLEAN | 관리자 대상 여부 | 공지관리 > 게시대상 체크박스 (p.46) |
| target_first_dealer | BOOLEAN | 1차점 대상 여부 | 공지관리 > 게시대상 체크박스 (p.46) |
| target_second_dealer | BOOLEAN | 2차이하 대상 여부 | 공지관리 > 게시대상 체크박스 (p.46) |
| target_constructor | BOOLEAN | 시공점 대상 여부 | 공지관리 > 게시대상 체크박스 (p.46) |
| target_general | BOOLEAN | 일반회원 대상 여부 | 공지관리 > 게시대상 체크박스 (p.46) |
| start_at | DATETIME | 게시 시작일시 | 공지관리 > 기간설정 (p.46), now < start_at → scheduled |
| end_at | DATETIME | 게시 종료일시 | 공지관리 > 기간설정 (p.46), now > end_at → ended |
| content | TEXT | 공지 내용 | 공지관리 > 내용 (p.46), 텍스트 |
| url | VARCHAR(500)? | 하이퍼링크 URL | 공지관리 > URL (p.46), 클릭 시 이동할 링크 |
| status | ENUM(NoticeStatus) | 상태: scheduled/active/ended | 현재 시각 기준 동적 판별 (start_at/end_at 비교) |
| author_source | ENUM(UserSource) | 등록자 사용자 소스 | 등록자 추적 |
| author_id | VARCHAR(255) | 등록자 ID | 등록자 추적 |
| updater_source | ENUM(UserSource)? | 수정자 사용자 소스 | 수정자 추적 |
| updater_id | VARCHAR(255)? | 수정자 ID | 수정자 추적 |
| created_at | DATETIME | 등록일시 | - |
| updated_at | DATETIME | 수정일시 | - |

---

### 14. qp_mass_mails (대량메일 발송)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 관리자가 특정 권한 그룹에 일괄 메일을 발송하는 기능. 임시저장(draft)→발송(sent) 워크플로우 지원. 발송대상을 권한별 체크박스로 선택하고, 3분 배치로 실제 발송 |
| **화면 근거** | 대량메일발송 (p.43-45) |
| **비즈니스 규칙** | 임시저장 기능, 복사(첨부파일 제외), 3분 배치 발송 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| sender_name | VARCHAR(255) | 발신자명 | 대량메일 등록 > 발신자명 (p.43) |
| author_source | ENUM(UserSource) | 작성자 사용자 소스 | 작성자 추적 |
| author_id | VARCHAR(255) | 작성자 ID | 작성자 추적 |
| target_super_admin | BOOLEAN | 슈퍼관리자 대상 | 대량메일 > 발송대상 체크박스 (p.43) |
| target_admin | BOOLEAN | 관리자 대상 | 대량메일 > 발송대상 체크박스 (p.43) |
| target_first_dealer | BOOLEAN | 1차점 대상 | 대량메일 > 발송대상 체크박스 (p.43) |
| target_second_dealer | BOOLEAN | 2차이하 대상 | 대량메일 > 발송대상 체크박스 (p.43) |
| target_constructor | BOOLEAN | 시공점 대상 | 대량메일 > 발송대상 체크박스 (p.43) |
| target_general | BOOLEAN | 일반회원 대상 | 대량메일 > 발송대상 체크박스 (p.43) |
| subject | VARCHAR(500) | 메일 제목 | 대량메일 등록 > 제목 (p.44) |
| body | MEDIUMTEXT | 메일 본문 | 대량메일 등록 > 내용 (p.44), 에디터 HTML |
| status | ENUM(MailStatus) | 상태: draft/sent | draft=임시저장, sent=발송완료 |
| sent_at | DATETIME? | 발송 일시 | 발송 완료 시 기록, 3분 배치 발송 시점 |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

---

### 15. qp_mass_mail_recipients (대량메일 CC/BCC 수신자)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 대량메일의 참조(CC)/숨은참조(BCC) 수신자를 별도 관리. 한화 사내직원만 참조/승인조로 추가 가능. 메인 수신자는 target_* 체크박스로 결정되므로 이 테이블에는 CC/BCC만 저장 |
| **화면 근거** | 대량메일발송 > CC/BCC 수신자 (p.44-45) |
| **비즈니스 규칙** | 참조/BCC는 전체 1번만 발송, 수신자에게는 해당 수신자 본인 정보만 표시 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| mass_mail_id | INT FK | 대량메일 ID → qp_mass_mails.id | 어떤 메일의 수신자인지 |
| recipient_type | ENUM('cc','bcc') | 수신 유형 | cc=참조, bcc=숨은참조 (p.44-45) |
| user_source | ENUM(UserSource) | 수신자 사용자 소스 | 한화 사내직원만 추가 가능 |
| external_user_id | VARCHAR(255) | 수신자 식별자 | 소스별 사용자 ID |
| email | VARCHAR(255) | 수신자 이메일 | 실제 발송에 사용할 이메일 주소 |

**FK**: mass_mail_id → qp_mass_mails.id (CASCADE DELETE)

---

### 16. qp_mass_mail_attachments (대량메일 첨부파일)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 대량메일에 첨부되는 파일 메타정보를 관리. 메일 복사 시 첨부파일은 제외되므로 별도 테이블로 분리 |
| **화면 근거** | 대량메일발송 > 파일첨부 (p.44) |
| **비즈니스 규칙** | 메일 복사 시 첨부파일 제외 (p.45) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| mass_mail_id | INT FK | 대량메일 ID → qp_mass_mails.id | 어떤 메일의 첨부파일인지 |
| file_name | VARCHAR(255) | 원본 파일명 | 첨부파일 목록에 표시 |
| file_path | VARCHAR(500) | 서버 저장 경로 | 다운로드 시 파일 접근 경로 |
| file_size | BIGINT? | 파일 크기 (bytes) | 파일 크기 표시 |
| created_at | DATETIME | 업로드 일시 | - |

**FK**: mass_mail_id → qp_mass_mails.id (CASCADE DELETE)

---

### 17. qp_download_logs (다운로드 기록)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 사용자별 콘텐츠 첨부파일 다운로드 이력을 추적. 마이페이지에서 자신의 다운로드 기록을 검색/조회 가능. 삭제된 콘텐츠나 열람기간이 지난 경우 취소선으로 표시 |
| **화면 근거** | 마이페이지 > 다운로드 기록 (p.37) |
| **비즈니스 규칙** | 제목/자료명 Like 검색, 삭제 data 또는 열람기간 지난 경우 취소선 표시 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| user_source | ENUM(UserSource) | 다운로드한 사용자의 소스 | 사용자 식별 |
| external_user_id | VARCHAR(255) | 다운로드한 사용자 ID | user_source와 조합하여 대상 특정 |
| content_id | INT FK | 콘텐츠 ID → qp_contents.id | 어떤 콘텐츠에서 다운로드했는지 |
| attachment_id | INT FK | 첨부파일 ID → qp_content_attachments.id | 어떤 파일을 다운로드했는지 |
| downloaded_at | DATETIME | 다운로드 일시 | 다운로드 기록 > 일시 (p.37) |

**FK**: content_id → qp_contents.id, attachment_id → qp_content_attachments.id (삭제 시 로그 유지)

---

### 18. qp_inquiries (문의등록)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 사용자가 Q.PARTNERS 사무국에 문의를 등록하면 HWJ 담당자에게 메일 발송. 로그인 전에도 접근 가능(260323 변경). 문의유형에 따라 수신 담당자가 차별화 |
| **화면 근거** | 문의등록 (p.38-39) |
| **비즈니스 규칙** | 로그인 전: 직접 입력, 로그인 후: 사용자 정보 자동 표시(read-only). 문의유형별 수신 담당자 차별화 발송 |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| user_source | ENUM(UserSource) | 문의자 사용자 소스 | 사용자 식별 |
| external_user_id | VARCHAR(255) | 문의자 사용자 ID | 로그인 사용자의 경우 자동 설정 |
| company_name | VARCHAR(255) | 회사명 (저장 시점 값) | 문의등록 > 회사명 (p.38 #1), 비로그인 시 직접 입력 (p.39) |
| user_name | VARCHAR(200) | 성명 (저장 시점 값) | 문의등록 > 성명 (p.38 #2), 비로그인 시 직접 입력 (p.39) |
| tel | VARCHAR(20)? | 전화번호 (저장 시점 값) | 문의등록 > 전화번호 (p.38 #3), 비로그인 시 직접 입력 (p.39) |
| email | VARCHAR(255) | 이메일 (저장 시점 값) | 문의등록 > 이메일 (p.38 #4), 접수확인 메일 발송 대상 |
| inquiry_type | VARCHAR(100)? | 문의 유형 | 문의등록 > 문의유형 드롭다운 (p.38 #6), 2026.03.19 요건 추가. 유형별 수신 담당자 차별화 |
| title | VARCHAR(500) | 문의 제목 | 문의등록 > 제목 (p.38 #7) |
| content | TEXT | 문의 내용 | 문의등록 > 내용 (p.38 #8) |
| created_at | DATETIME | 등록 일시 | - |

---

### ━━━ 시스템 코드 관련 (2개) ━━━

### 19. qp_code_headers (코드관리 헤더)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 시스템 전반에서 사용되는 공통코드(드롭다운 옵션, 상태값 등)의 그룹(헤더)을 정의. Header Code로 코드 그룹을 식별하고, 하위 Detail에서 실제 값을 관리. 예: '100300'(STAT_CD) 헤더 아래 Active/Inactive 등의 상세 코드 |
| **화면 근거** | 관리자 > 코드 관리 (p.52) |
| **비즈니스 규칙** | Header Code는 수정 불가 (p.52, 5a 등) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| header_code | VARCHAR(20) UNIQUE | 헤더 코드 (수정 불가) | 코드 관리 (p.52), 예: 100300, 100600. 등록 후 변경 불가 |
| header_id | VARCHAR(50) | 헤더 식별자 | 코드 관리 (p.52), 예: STAT_CD, COMPANY. 코드의 논리적 명칭 |
| header_name | VARCHAR(255) | 헤더명 | 코드 관리 (p.52), 예: Status, Company. 화면 표시용 |
| rel_code1 | VARCHAR(50)? | 관련 코드 1 | 확장용 — 다른 코드 참조 시 사용 |
| rel_code2 | VARCHAR(50)? | 관련 코드 2 | 확장용 |
| rel_code3 | VARCHAR(50)? | 관련 코드 3 | 확장용 |
| rel_num1 | DECIMAL(15,2)? | 관련 숫자 1 | 확장용 — 코드에 수치값 연결 시 사용 |
| rel_num2 | DECIMAL(15,2)? | 관련 숫자 2 | 확장용 |
| rel_num3 | DECIMAL(15,2)? | 관련 숫자 3 | 확장용 |
| is_active | BOOLEAN | 사용 여부 Y/N | 비활성화 시 해당 코드 그룹 전체 미사용 |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

---

### 20. qp_code_details (코드관리 디테일)

| 항목 | 내용 |
|------|------|
| **테이블이 필요한 이유** | 코드 헤더 아래의 개별 코드값을 정의. 예를 들어 '100300'(Status) 헤더 아래 'ACT'(Active), 'DEL'(Deleted) 등의 상세 코드가 들어감. 드롭다운/체크박스의 선택 옵션이 되는 실제 데이터 |
| **화면 근거** | 관리자 > 코드 관리 > Detail (p.52) |

| 컬럼 | 타입 | 설명 | 근거 |
|------|------|------|------|
| id | INT PK | 자동증가 PK | - |
| header_id | INT FK | 헤더 ID → qp_code_headers.id | 어떤 코드 그룹에 속하는지 |
| code | VARCHAR(20) | 코드값 | 코드 관리 (p.52), 시스템 내부에서 사용하는 실제 값 |
| display_code | VARCHAR(20) | 화면 표시용 코드 | 코드 관리 (p.52), UI에 표시되는 코드 (code와 다를 수 있음) |
| code_name | VARCHAR(255) | 코드명 | 코드 관리 (p.52), 화면에 표시되는 이름 (예: Active, Inactive) |
| code_name_etc | VARCHAR(255)? | 코드명 부가정보 | 코드명의 추가 설명이나 다국어 표기 |
| rel_code1 | VARCHAR(50)? | 관련 코드 1 | 확장용 — 다른 코드 참조 시 사용 |
| rel_code2 | VARCHAR(50)? | 관련 코드 2 | 확장용 |
| rel_num1 | DECIMAL(15,2)? | 관련 숫자 1 | 확장용 — 코드에 수치값 연결 시 사용 |
| sort_order | INT | 정렬 순서 | 드롭다운/목록에서 표시 순서 |
| is_active | BOOLEAN | 사용 여부 Y/N | 비활성화 시 해당 코드 선택 불가 |
| created_at | DATETIME | 등록일시 | - |
| created_by | VARCHAR(255)? | 등록자 ID | 감사 추적용 |
| updated_at | DATETIME | 수정일시 | - |
| updated_by | VARCHAR(255)? | 수정자 ID | 감사 추적용 |

**복합 유니크**: `(header_id, code)` — 동일 헤더 내 코드 중복 불가
**FK**: header_id → qp_code_headers.id (CASCADE DELETE)

---

## Enum 정의

| Enum | 값 | 설명 | 사용 테이블 |
|------|-----|------|-----------|
| UserSource | qsp, seko, general | 사용자 소스: QSP기존/AS-IS시공점/신규일반 | contents, home_notices, mass_mails, password_reset_tokens, two_factor_codes, download_logs, inquiries |
| ContentStatus | draft, published, deleted | 콘텐츠 상태 | contents |
| TargetType | first_dealer, second_dealer, constructor, general, non_member | 게시대상 유형 | content_targets |
| NoticeStatus | scheduled, active, ended | 공지 상태 | home_notices |
| MailStatus | draft, sent | 메일 상태 | mass_mails |
| RecipientType | cc, bcc | 수신 유형 | mass_mail_recipients |

---

## 전체 테이블 요약

| # | 구분 | 테이블 (Prisma) | 물리명 | 화면 근거 | 존재 이유 요약 |
|---|------|----------------|--------|---------|--------------|
| 1 | QSP | — | qp_general_users | p.16-18, p.34 | 일반회원 인적/법인정보 (QSP에 없던 유형) |
| 2 | QSP | — | qp_info | p.9-10, p.13-14, p.41-42 | 전 회원 QP 서비스 설정 통합 관리 |
| 3 | 권한 | QpRole | qp_roles | p.49 | 7단계 권한 정의 |
| 4 | 권한 | QpRoleMenuPermission | qp_role_menu_permissions | p.50 | 권한별 메뉴 CRUD 접근제어 |
| 5 | 시스템 | Menu | qp_menus | p.51 | GNB 메뉴 구조 동적 관리 |
| 6 | 콘텐츠 | Content | qp_contents | p.22-31 | 핵심 기능, AS-IS 4테이블 통합 |
| 7 | 콘텐츠 | ContentTarget | qp_content_targets | p.25 #7,#8 | 대상별 기간별 게시 제어 |
| 8 | 콘텐츠 | Category | qp_categories | p.24, p.25-26, p.48 | 8대분류 2Depth 트리 카테고리 |
| 9 | 콘텐츠 | ContentCategory | qp_content_categories | p.25-26, p.28 | 콘텐츠-카테고리 N:M 연결 |
| 10 | 콘텐츠 | ContentAttachment | qp_content_attachments | p.27 #13, p.29 #11-12 | 첨부파일 메타정보+다운로드 |
| 11 | 인증 | PasswordResetToken | qp_password_reset_tokens | p.11-12 | 비밀번호 초기화 토큰 관리 |
| 12 | 인증 | TwoFactorCode | qp_two_factor_codes | p.14-15 | 2차인증 6자리 코드 |
| 13 | 관리 | HomeNotice | qp_home_notices | p.46-47 | 홈화면 공지 (권한별/기간별) |
| 14 | 관리 | MassMail | qp_mass_mails | p.43-45 | 대량메일 발송 |
| 15 | 관리 | MassMailRecipient | qp_mass_mail_recipients | p.44-45 | 대량메일 CC/BCC 수신자 |
| 16 | 관리 | MassMailAttachment | qp_mass_mail_attachments | p.44 | 대량메일 첨부파일 |
| 17 | 관리 | DownloadLog | qp_download_logs | p.37 | 사용자별 다운로드 이력 |
| 18 | 관리 | Inquiry | qp_inquiries | p.38-39 | 문의등록 (비로그인도 가능) |
| 19 | 시스템 | CodeHeader | qp_code_headers | p.52 | 공통코드 그룹(헤더) |
| 20 | 시스템 | CodeDetail | qp_code_details | p.52 | 공통코드 상세값 |
