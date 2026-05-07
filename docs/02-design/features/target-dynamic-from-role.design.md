# Target Dynamic from Role — Design Document

> **Summary**: 4개 화면 게시대상/수신대상의 schema 잠금을 `qp_roles` 기반 동적 모델로 전환하는 상세 설계. enum 제거 + boolean 정규화 + isSystem 가드 + JWT 동적 검증 통합.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-07
> **Status**: Implemented v0.1 (2026-05-07 — 설계 → 구현 동기화 완료, lint·typecheck·build 0 errors)
> **Planning Doc**: [target-dynamic-from-role.plan.md](../../01-plan/features/target-dynamic-from-role.plan.md)
> **Branch**: `feature/target-dynamic-from-role` (base: `development` HEAD `351d2e3`)

---

## 1. Architecture Overview

### 1.1 현재 구조 (절반만 연결됨)

```
┌─────────────────────┐     ┌──────────────────┐
│ qp_roles (동적)      │     │ schema 잠금       │
│ - SUPER_ADMIN       │     │                  │
│ - ADMIN             │     │ enum TargetType  │
│ - GENERAL           │ ←──→│ (5종 정적)       │
│ - 1ST_STORE         │     │                  │
│ - 2ND_STORE         │     │ boolean 6개 컬럼   │
│ - SEKO              │     │ (HomeNotice/     │
│ - + 신규 D (운영자)   │ ✗  │  MassMail)       │
└─────────────────────┘     │                  │
       ↓                    │ enum             │
       라벨 동기화 ✓          │ RecipientAuth   │
       옵션 동기화 ✗          │ Role (6종)       │
                            └──────────────────┘
```

→ 권한관리에서 추가한 D 가 schema 에 없어서 옵션 미노출.

### 1.2 목표 구조 (단일 진실 원천)

```
┌─────────────────────┐
│ qp_roles            │←── 모든 게시대상/수신대상 옵션의 단일 source
│ + isSystem 컬럼     │
│ + 6 기본 권한 보호    │
└─────────────────────┘
       ↓ FK
┌─────────────────────┬───────────────────┬──────────────────┐
│ ContentTarget       │ HomeNoticeTarget   │ MassMailTarget   │
│ - roleCode (null OK)│ - roleCode (FK)    │ - roleCode (FK)   │
│   = 비회원           │                   │                  │
└─────────────────────┴───────────────────┴──────────────────┘

┌─────────────────────┐
│ MassMailRecipient   │
│ - authRoleCode      │←── snapshot (FK 없음, 발송 시점 보존)
│   String            │
└─────────────────────┘
```

### 1.3 핵심 설계 원칙

1. **단일 진실 원천**: `qp_roles` 가 모든 권한 관련 옵션의 source
2. **NON_MEMBER 외부 sentinel**: 비회원은 `qp_roles` 외부 (`useTargetLabels.ts:15` 코드 의도 보존). `roleCode IS NULL` 로 표현
3. **6 기본 권한 시스템 보호**: `isSystem=true` 로 운영자 실수 차단 (`isActive` / `roleCode` / 삭제 차단)
4. **추가 권한 자유 편집**: `isSystem=false`, `isActive` 토글만으로 활성/비활성, hard delete 없음
5. **MassMailRecipient snapshot 보존**: 발송 후 권한 변경/삭제 무관하게 발송 시점 권한 정보 보존 (FK 없는 String)

---

## 2. Schema Diff

### 2.1 `QpRole` — isSystem 컬럼 추가

```diff
 model QpRole {
   id          Int                    @id @default(autoincrement())
   roleCode    String                 @unique @map("role_code") @db.VarChar(50)
   roleName    String                 @map("role_name") @db.VarChar(100)
   description String?                @db.VarChar(500)
   isActive    Boolean                @default(true) @map("is_active")
+  isSystem    Boolean                @default(false) @map("is_system")
   createdAt   DateTime               @default(now()) @map("created_at")
   createdBy   String?                @map("created_by") @db.VarChar(255)
   updatedAt   DateTime               @updatedAt @map("updated_at")
   updatedBy   String?                @map("updated_by") @db.VarChar(255)
   permissions QpRoleMenuPermission[]
+  contentTargets    ContentTarget[]
+  homeNoticeTargets HomeNoticeTarget[]
+  massMailTargets   MassMailTarget[]

   @@map("qp_roles")
 }
```

### 2.2 `ContentTarget` — enum → nullable roleCode

```diff
 model ContentTarget {
   id         Int        @id @default(autoincrement())
   contentId  Int        @map("content_id")
-  targetType TargetType @map("target_type")
+  roleCode   String?    @map("role_code") @db.VarChar(50)  // null = 비회원
   startAt    DateTime?  @map("start_at")
   endAt      DateTime?  @map("end_at")
   createdAt  DateTime   @default(now()) @map("created_at")
   createdBy  String?    @map("created_by") @db.VarChar(255)
   updatedAt  DateTime   @updatedAt @map("updated_at")
   updatedBy  String?    @map("updated_by") @db.VarChar(255)
   content    Content    @relation(fields: [contentId], references: [id], onDelete: Cascade)
+  role       QpRole?    @relation(fields: [roleCode], references: [roleCode], onDelete: Restrict)

-  @@unique([contentId, targetType], map: "idx_content_target")
-  @@index([targetType, startAt, endAt], map: "idx_target_period")
+  @@unique([contentId, roleCode], map: "idx_content_target")
+  @@index([roleCode, startAt, endAt], map: "idx_target_period")
   @@map("qp_content_targets")
 }
```

> **Note**: `@@unique` 가 NULL 을 어떻게 처리하는지 MariaDB 기준 — NULL 값은 unique 제약을 무시 (NULL ≠ NULL). 비회원 게시대상은 콘텐츠당 최대 1개만 허용하려면 별도 partial unique index 또는 application 검증.

### 2.3 `HomeNotice` — boolean 6개 제거 + `HomeNoticeTarget` 신규

```diff
 model HomeNotice {
   id                 Int                       @id @default(autoincrement())
   userType           qp_home_notices_user_type @map("user_type")
   userId             String                    @map("user_id") @db.VarChar(255)
-  targetSuperAdmin   Boolean                   @default(false) @map("target_super_admin")
-  targetAdmin        Boolean                   @default(false) @map("target_admin")
-  targetFirstStore   Boolean                   @default(false) @map("target_first_store")
-  targetSecondStore  Boolean                   @default(false) @map("target_second_store")
-  targetConstructor  Boolean                   @default(false) @map("target_constructor")
-  targetGeneral      Boolean                   @default(false) @map("target_general")
   startAt            DateTime                  @map("start_at")
   endAt              DateTime                  @map("end_at")
   title              String                    @default("無題") @db.VarChar(100)
   content            String                    @db.Text
   url                String?                   @db.VarChar(500)
   createdAt          DateTime                  @default(now()) @map("created_at")
   createdBy          String?                   @map("created_by") @db.VarChar(255)
   updatedAt          DateTime                  @updatedAt @map("updated_at")
   updatedBy          String?                   @map("updated_by") @db.VarChar(255)
+  targets            HomeNoticeTarget[]

   @@index([startAt, endAt], map: "idx_period")
   @@map("qp_home_notices")
 }

+model HomeNoticeTarget {
+  id           Int        @id @default(autoincrement())
+  homeNoticeId Int        @map("home_notice_id")
+  roleCode     String     @map("role_code") @db.VarChar(50)
+  homeNotice   HomeNotice @relation(fields: [homeNoticeId], references: [id], onDelete: Cascade)
+  role         QpRole     @relation(fields: [roleCode], references: [roleCode], onDelete: Restrict)
+
+  @@unique([homeNoticeId, roleCode], map: "uq_notice_role")
+  @@index([roleCode], map: "idx_notice_role")
+  @@map("qp_home_notice_targets")
+}
```

### 2.4 `MassMail` — boolean 6개 제거 + `MassMailTarget` 신규

```diff
 model MassMail {
   id                 Int                     @id @default(autoincrement())
   userType           qp_mass_mails_user_type @map("user_type")
   userId             String                  @map("user_id") @db.VarChar(255)
   senderName         String                  @map("sender_name") @db.VarChar(255)
-  targetSuperAdmin   Boolean                 @default(false) @map("target_super_admin")
-  targetAdmin        Boolean                 @default(false) @map("target_admin")
-  targetFirstStore   Boolean                 @default(false) @map("target_first_store")
-  targetSecondStore  Boolean                 @default(false) @map("target_second_store")
-  targetConstructor  Boolean                 @default(false) @map("target_constructor")
-  targetGeneral      Boolean                 @default(false) @map("target_general")
   subject            String                  @db.VarChar(500)
   // ... (이하 동일)
+  targets            MassMailTarget[]
   attachments        MassMailAttachment[]
   recipients         MassMailRecipient[]
 }

+model MassMailTarget {
+  id         Int      @id @default(autoincrement())
+  massMailId Int      @map("mass_mail_id")
+  roleCode   String   @map("role_code") @db.VarChar(50)
+  massMail   MassMail @relation(fields: [massMailId], references: [id], onDelete: Cascade)
+  role       QpRole   @relation(fields: [roleCode], references: [roleCode], onDelete: Restrict)
+
+  @@unique([massMailId, roleCode], map: "uq_mail_role")
+  @@index([roleCode], map: "idx_mail_role")
+  @@map("qp_mass_mail_targets")
+}
```

### 2.5 `MassMailRecipient` — enum → String snapshot

```diff
 model MassMailRecipient {
   id           Int               @id @default(autoincrement())
   massMailId   Int               @map("mass_mail_id")
   email        String            @db.VarChar(255)
   userName     String?           @map("user_name") @db.VarChar(255)
-  authRole     RecipientAuthRole @map("auth_role")
+  authRoleCode String            @map("auth_role_code") @db.VarChar(50)  // snapshot, FK 없음
   status       RecipientStatus   @default(pending)
   // ... (이하 동일)
 }
```

### 2.6 `enum TargetType` / `enum RecipientAuthRole` 제거

```diff
-enum TargetType {
-  first_store  @map("1st_store")
-  second_store @map("2nd_store")
-  seko
-  general
-  non_member
-}

-enum RecipientAuthRole {
-  SUPER_ADMIN
-  ADMIN
-  FIRST_STORE
-  SECOND_STORE
-  SEKO
-  GENERAL
-}
```

---

## 3. 마이그레이션 SQL — 5단계 트랜잭션

`prisma/migrations/<timestamp>_target_dynamic_from_role/migration.sql`:

```sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Target Dynamic from Role — 4개 화면 게시대상 동적화
-- 생성일: 2026-05-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

START TRANSACTION;

-- ─── 단계 1 — qp_roles isSystem 컬럼 추가 + 6 기본 권한 보호 마킹 ───
ALTER TABLE qp_roles ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;

UPDATE qp_roles SET is_system = TRUE, is_active = TRUE
  WHERE role_code IN ('SUPER_ADMIN','ADMIN','GENERAL','1ST_STORE','2ND_STORE','SEKO');

-- 검증 — 6 기본 권한이 정확히 6 row, isSystem=TRUE 인지
-- SELECT COUNT(*) FROM qp_roles WHERE is_system = TRUE;  -- 6 이어야 함

-- ─── 단계 2 — ContentTarget enum → nullable roleCode ───
ALTER TABLE qp_content_targets ADD COLUMN role_code VARCHAR(50) NULL;

UPDATE qp_content_targets SET role_code = '1ST_STORE'  WHERE target_type = '1st_store';
UPDATE qp_content_targets SET role_code = '2ND_STORE'  WHERE target_type = '2nd_store';
UPDATE qp_content_targets SET role_code = 'SEKO'       WHERE target_type = 'seko';
UPDATE qp_content_targets SET role_code = 'GENERAL'    WHERE target_type = 'general';
UPDATE qp_content_targets SET role_code = NULL         WHERE target_type = 'non_member';

-- index/unique 재구축
DROP INDEX idx_content_target ON qp_content_targets;
DROP INDEX idx_target_period ON qp_content_targets;
ALTER TABLE qp_content_targets DROP COLUMN target_type;
CREATE UNIQUE INDEX idx_content_target ON qp_content_targets(content_id, role_code);
CREATE INDEX idx_target_period ON qp_content_targets(role_code, start_at, end_at);

-- FK 추가 (nullable → role_code IS NULL = 비회원, NULL 은 FK 무시됨)
ALTER TABLE qp_content_targets
  ADD CONSTRAINT fk_content_target_role
  FOREIGN KEY (role_code) REFERENCES qp_roles(role_code) ON DELETE RESTRICT;

-- ─── 단계 3 — HomeNoticeTarget 정규화 ───
CREATE TABLE qp_home_notice_targets (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  home_notice_id  INT NOT NULL,
  role_code       VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_notice_role (home_notice_id, role_code),
  INDEX idx_notice_role (role_code),
  CONSTRAINT fk_notice_target_notice FOREIGN KEY (home_notice_id)
    REFERENCES qp_home_notices(id) ON DELETE CASCADE,
  CONSTRAINT fk_notice_target_role FOREIGN KEY (role_code)
    REFERENCES qp_roles(role_code) ON DELETE RESTRICT
);

-- boolean 6개 → row 변환
INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
  SELECT id, 'SUPER_ADMIN' FROM qp_home_notices WHERE target_super_admin = TRUE;
INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
  SELECT id, 'ADMIN' FROM qp_home_notices WHERE target_admin = TRUE;
INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
  SELECT id, '1ST_STORE' FROM qp_home_notices WHERE target_first_store = TRUE;
INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
  SELECT id, '2ND_STORE' FROM qp_home_notices WHERE target_second_store = TRUE;
INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
  SELECT id, 'SEKO' FROM qp_home_notices WHERE target_constructor = TRUE;
INSERT INTO qp_home_notice_targets (home_notice_id, role_code)
  SELECT id, 'GENERAL' FROM qp_home_notices WHERE target_general = TRUE;

-- 검증 — boolean true 합계 = HomeNoticeTarget 행 수
-- SELECT
--   (SELECT COUNT(*) FROM qp_home_notices WHERE target_super_admin) +
--   (SELECT COUNT(*) FROM qp_home_notices WHERE target_admin) +
--   (SELECT COUNT(*) FROM qp_home_notices WHERE target_first_store) +
--   (SELECT COUNT(*) FROM qp_home_notices WHERE target_second_store) +
--   (SELECT COUNT(*) FROM qp_home_notices WHERE target_constructor) +
--   (SELECT COUNT(*) FROM qp_home_notices WHERE target_general)
--   AS expected,
--   (SELECT COUNT(*) FROM qp_home_notice_targets) AS actual;
-- expected = actual 이어야 함

ALTER TABLE qp_home_notices
  DROP COLUMN target_super_admin,
  DROP COLUMN target_admin,
  DROP COLUMN target_first_store,
  DROP COLUMN target_second_store,
  DROP COLUMN target_constructor,
  DROP COLUMN target_general;

-- ─── 단계 4 — MassMailTarget 정규화 + MassMailRecipient snapshot 변환 ───
CREATE TABLE qp_mass_mail_targets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  mass_mail_id  INT NOT NULL,
  role_code     VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_mail_role (mass_mail_id, role_code),
  INDEX idx_mail_role (role_code),
  CONSTRAINT fk_mail_target_mail FOREIGN KEY (mass_mail_id)
    REFERENCES qp_mass_mails(id) ON DELETE CASCADE,
  CONSTRAINT fk_mail_target_role FOREIGN KEY (role_code)
    REFERENCES qp_roles(role_code) ON DELETE RESTRICT
);

INSERT INTO qp_mass_mail_targets (mass_mail_id, role_code)
  SELECT id, 'SUPER_ADMIN' FROM qp_mass_mails WHERE target_super_admin = TRUE;
INSERT INTO qp_mass_mail_targets (mass_mail_id, role_code)
  SELECT id, 'ADMIN' FROM qp_mass_mails WHERE target_admin = TRUE;
INSERT INTO qp_mass_mail_targets (mass_mail_id, role_code)
  SELECT id, '1ST_STORE' FROM qp_mass_mails WHERE target_first_store = TRUE;
INSERT INTO qp_mass_mail_targets (mass_mail_id, role_code)
  SELECT id, '2ND_STORE' FROM qp_mass_mails WHERE target_second_store = TRUE;
INSERT INTO qp_mass_mail_targets (mass_mail_id, role_code)
  SELECT id, 'SEKO' FROM qp_mass_mails WHERE target_constructor = TRUE;
INSERT INTO qp_mass_mail_targets (mass_mail_id, role_code)
  SELECT id, 'GENERAL' FROM qp_mass_mails WHERE target_general = TRUE;

ALTER TABLE qp_mass_mails
  DROP COLUMN target_super_admin,
  DROP COLUMN target_admin,
  DROP COLUMN target_first_store,
  DROP COLUMN target_second_store,
  DROP COLUMN target_constructor,
  DROP COLUMN target_general;

-- MassMailRecipient.authRole enum → String snapshot
ALTER TABLE qp_mass_mail_recipients ADD COLUMN auth_role_code VARCHAR(50) NULL;
UPDATE qp_mass_mail_recipients SET auth_role_code = 'SUPER_ADMIN'  WHERE auth_role = 'SUPER_ADMIN';
UPDATE qp_mass_mail_recipients SET auth_role_code = 'ADMIN'        WHERE auth_role = 'ADMIN';
UPDATE qp_mass_mail_recipients SET auth_role_code = '1ST_STORE'    WHERE auth_role = 'FIRST_STORE';
UPDATE qp_mass_mail_recipients SET auth_role_code = '2ND_STORE'    WHERE auth_role = 'SECOND_STORE';
UPDATE qp_mass_mail_recipients SET auth_role_code = 'SEKO'         WHERE auth_role = 'SEKO';
UPDATE qp_mass_mail_recipients SET auth_role_code = 'GENERAL'      WHERE auth_role = 'GENERAL';

-- 검증 — NULL 0건이어야 함
-- SELECT COUNT(*) FROM qp_mass_mail_recipients WHERE auth_role_code IS NULL;  -- 0

ALTER TABLE qp_mass_mail_recipients DROP COLUMN auth_role;
ALTER TABLE qp_mass_mail_recipients MODIFY auth_role_code VARCHAR(50) NOT NULL;
-- snapshot — FK 없음 (수신 시점 보존, 권한 변경/삭제와 무관)

-- ─── 단계 5 — enum 제거 (Prisma migration 자동 처리) ───
-- DROP TYPE TargetType;       -- Prisma 가 자동 생성
-- DROP TYPE RecipientAuthRole; -- Prisma 가 자동 생성

COMMIT;
```

### 3.1 Dry-run 절차

```bash
# 1. dev DB 백업
mysqldump -u <user> -p <db_name> > backup_2026-05-07_pre_target_dynamic.sql

# 2. dry-run (별도 dev DB 또는 docker DB)
mysql -u <user> -p <db_name> < migration.sql

# 3. 검증 SELECT 실행 (각 단계 주석 참조)
# 4. 문제 없으면 dev 운영 DB 적용
# 5. 문제 있으면 backup 으로 RESTORE 후 SQL 수정
```

---

## 4. BE 공용 헬퍼

### 4.1 `resolveActiveRoleCodes()` — 활성 권한 코드 동적 조회

파일: `src/lib/auth.ts`

```typescript
/**
 * 활성 권한 코드 목록 동적 조회.
 *
 * - 6 기본 권한 (isSystem=true) + 운영자 정의 활성 추가 권한 (isSystem=false AND isActive=true)
 * - JWT 검증, 게시대상 등록 검증, 회원관리 권한 변경 검증 모두 공유
 * - per-request 캐싱 (`React.cache()` 또는 단일 req scope) — Phase 5 평가
 */
export async function resolveActiveRoleCodes(): Promise<Set<string>> {
  const rows = await prisma.qpRole.findMany({
    where: { isActive: true },  // 6 기본 (Y 고정) + 활성 추가 권한
    select: { roleCode: true },
  });
  return new Set(rows.map((r) => r.roleCode));
}
```

### 4.2 `canAccessContent` 재설계

```typescript
/**
 * 콘텐츠 접근 권한 검증.
 *
 * - SUPER_ADMIN/ADMIN: 무조건 통과
 * - 비로그인: 비회원 게시대상 (`roleCode IS NULL`) 콘텐츠만 통과
 * - 로그인: 사용자 authRole 과 일치하는 게시대상 콘텐츠 통과
 */
export function canAccessContent(
  user: UserInfo | null,
  contentTargets: { roleCode: string | null }[],
): boolean {
  // 비로그인
  if (!user) {
    return contentTargets.some((t) => t.roleCode === null);
  }

  // 관리자 fail-open
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;

  // 일반 권한 회원 — roleCode 일치
  return contentTargets.some((t) => t.roleCode === user.role);
}
```

### 4.3 6 기본 권한 보호 가드

파일: `src/app/api/roles/[roleCode]/route.ts`

```typescript
const SYSTEM_ROLE_CODES = new Set([
  "SUPER_ADMIN", "ADMIN", "GENERAL", "1ST_STORE", "2ND_STORE", "SEKO",
]);

export async function PUT(request: NextRequest, { params }: { params: Promise<{ roleCode: string }> }) {
  try {
    const { roleCode } = await params;
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "update");
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    // 6 기본 권한 보호 — isSystem=true row
    const existing = await prisma.qpRole.findUnique({ where: { roleCode } });
    if (!existing) {
      return NextResponse.json({ error: "存在しない権限です" }, { status: 404 });
    }

    if (existing.isSystem) {
      // 6 기본 권한 — isActive / roleCode 변경 거부, roleName 만 허용
      if (body.isActive !== undefined && body.isActive !== existing.isActive) {
        return NextResponse.json(
          { error: "システム権限の使用可否は変更できません", roleCode },
          { status: 400 },
        );
      }
      if (body.roleCode !== undefined && body.roleCode !== existing.roleCode) {
        return NextResponse.json(
          { error: "システム権限の権限コードは変更できません", roleCode },
          { status: 400 },
        );
      }
    }

    // 추가 권한도 roleCode 변경 불가 (FK 무결성)
    if (!existing.isSystem && body.roleCode !== undefined && body.roleCode !== existing.roleCode) {
      return NextResponse.json(
        { error: "権限コードは変更できません", roleCode },
        { status: 400 },
      );
    }

    const updated = await prisma.qpRole.update({
      where: { roleCode },
      data: {
        roleName: body.roleName,
        ...(existing.isSystem ? {} : { isActive: body.isActive }),
        // isSystem 필드는 운영자 input 무시 (서버 결정)
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/roles/[roleCode]]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

// DELETE 메서드 신설 안 함 — 모든 권한 hard delete 없음 (소프트 비활성화로 대체)
```

### 4.4 신규 권한 생성 가드

파일: `src/app/api/roles/route.ts` (POST)

```typescript
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "create");
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    // 운영자 input 의 isSystem 무시 (서버 강제 false)
    // SYSTEM_ROLE_CODES 와 충돌하는 코드 거부
    if (SYSTEM_ROLE_CODES.has(body.roleCode)) {
      return NextResponse.json(
        { error: "予約された権限コードは使用できません", roleCode: body.roleCode },
        { status: 400 },
      );
    }

    const created = await prisma.qpRole.create({
      data: {
        roleCode: body.roleCode,
        roleName: body.roleName,
        description: body.description,
        isActive: body.isActive ?? true,
        isSystem: false,  // 운영자 input 무시 — 서버 강제
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/roles]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
```

---

## 5. JWT authRole 검증 동적화

### 5.1 현재 (`src/lib/schemas/auth.ts:89`)

```typescript
authRole: z.enum(authRoleValues).optional(),  // 6 기본 enum 만 통과
```

### 5.2 변경 — 동적 검증

```typescript
import { resolveActiveRoleCodes } from "@/lib/auth";

// JWT payload schema — async 검증 필요 시 transform 활용
export const jwtPayloadSchema = z.object({
  // ... 기존 필드
  authRole: z.string().optional(),  // 1차: 문자열 검증만
  // ...
});

// 비동기 검증 헬퍼 — login API / middleware 에서 호출
export async function validateAuthRole(authRole: string | undefined): Promise<boolean> {
  if (authRole === undefined) return true;
  const activeCodes = await resolveActiveRoleCodes();
  return activeCodes.has(authRole);
}
```

### 5.3 적용 지점

| 위치 | 변경 |
|---|---|
| `src/app/api/auth/login/route.ts` | JWT 발급 직전 `validateAuthRole(authRole)` 검증 + 실패 시 401 |
| `src/middleware.ts` | JWT decode 후 `authRole` 동적 검증 (per-request cache 활용) |
| `src/lib/auth.ts:getUserFromHeaders` | header 에서 user 정보 파싱 시 동적 검증 |

→ 신규 권한 D 부여한 회원 로그인 가능 + 미들웨어 통과 + API 접근.

---

## 6. FE 핵심 — `useTargetLabels` 동적화

### 6.1 시그니처 (호환 유지)

```typescript
// 호환 시그니처 — 호출처 변경 최소화
interface TargetLabelsResult {
  resolveLabel(roleCode: string | null): string;  // null = 비회원
  isAvailable(roleCode: string | null): boolean;
  getRoleCode(target: { roleCode: string | null }): string | null;  // identity
  allOptions: TargetTypeOption[];  // qp_roles 동적 + 비회원 sentinel
  isLoading: boolean;
}

interface TargetTypeOption {
  /** roleCode (null = 비회원) */
  value: string | null;
  /** 권한관리 roleName 또는 비회원 라벨 */
  label: string;
  /** isActive — 비회원은 항상 true */
  isActive: boolean;
  /** roleCode (null = 비회원) */
  roleCode: string | null;
}
```

### 6.2 구현

```typescript
const NON_MEMBER_LABEL = "非会員";

export function useTargetLabels() {
  const { data, isLoading } = useQuery({
    queryKey: ["role-labels"],
    queryFn: async () => {
      // 권한관리 활성 권한 + isSystem 정보 응답
      const res = await api.get<{ data: RoleLabelApiItem[] }>("/role-labels");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const byCode = new Map<string, RoleLabelApiItem>();
    for (const r of data ?? []) byCode.set(r.roleCode, r);

    const resolveLabel = (roleCode: string | null): string => {
      if (roleCode === null) return NON_MEMBER_LABEL;
      return byCode.get(roleCode)?.roleName ?? roleCode;
    };

    const isAvailable = (roleCode: string | null): boolean => {
      if (roleCode === null) return true;  // 비회원 항상 활성
      return byCode.get(roleCode)?.isActive ?? false;
    };

    // 표시 옵션 — 활성 권한 + 비회원 sentinel
    const activeOptions: TargetTypeOption[] = (data ?? [])
      .filter((r) => r.isActive)
      .map((r) => ({
        value: r.roleCode,
        label: r.roleName,
        isActive: true,
        roleCode: r.roleCode,
      }));

    const allOptions: TargetTypeOption[] = [
      ...activeOptions,
      // 비회원 sentinel 추가 (콘텐츠만 노출 — 홈공지/대량메일에서는 hide 결정)
      { value: null, label: NON_MEMBER_LABEL, isActive: true, roleCode: null },
    ];

    return { resolveLabel, isAvailable, allOptions, isLoading };
  }, [data, isLoading]);
}
```

### 6.3 비회원 sentinel 노출 정책

| 화면 | 비회원 옵션 노출 |
|---|:---:|
| 콘텐츠 게시대상 | ✓ (기존 동작 유지) |
| 홈공지 게시대상 | ✗ (홈공지는 로그인 회원 대상이라 비회원 무관) |
| 대량메일 수신대상 | ✗ (이메일 발송이라 비회원 무관) |
| 회원관리 상세 SelectBox | ✗ (회원에게 부여하는 권한이라 비회원 무관) |

→ 콘텐츠 화면 컴포넌트만 `allOptions` 사용, 홈공지/대량메일/회원관리는 `activeOptions` (비회원 제외) 사용.

---

## 7. 권한관리 UI — 6 기본 권한 보호

### 7.1 `permissions-table.tsx`

```tsx
// 행 단위 disabled 처리
<Switch
  checked={role.isActive}
  disabled={role.isSystem}  // ← 6 기본 권한은 토글 비활성
  onCheckedChange={(checked) => handleToggleActive(role.roleCode, checked)}
/>

<Input
  value={role.roleCode}
  readOnly  // 모든 권한 — 생성 후 변경 불가
/>

<Input
  value={role.roleName}
  onChange={(e) => handleNameChange(role.roleCode, e.target.value)}
  // 6 기본 + 추가 권한 모두 권한명 변경 가능
/>

{/* 삭제 버튼 — 신설 안 함 (모든 권한 hard delete 없음) */}
```

### 7.2 신규 권한 추가 모달

```tsx
<Input placeholder="権限コード" value={roleCode} onChange={...} />
<Input placeholder="権限名" value={roleName} onChange={...} />
<Switch checked={isActive} onCheckedChange={...} label="使用" />
{/* isSystem 필드는 입력 X — 서버에서 강제 false */}
```

---

## 8. RecipientAuthRole 처리 (스냅샷 변환)

### 8.1 정책 — FK 없음

| 측면 | 결정 |
|---|---|
| FK | ✗ 없음 (`MassMailRecipient.authRoleCode` 는 String) |
| 이유 | 발송 후 권한 변경/비활성화/(미래) 삭제 시 발송 이력 무결성 보존 |
| 표기 정합성 | 마이그레이션 시 `FIRST_STORE` → `1ST_STORE` 등 변환 |
| 신규 권한 D 발송 시 | snapshot 으로 D 그대로 저장. D 가 향후 비활성화되어도 발송 이력은 D 보존 |
| FE 표시 | `useTargetLabels.resolveLabel(authRoleCode)` — 권한명 표시 (현재 라벨 동기화). 이후 권한이 삭제/변경되어도 fallback 으로 코드 그대로 표시 |

### 8.2 collect-recipients 변경

파일: `src/lib/mass-mail/collect-recipients.ts`

```typescript
// 기존: boolean 6개 분기로 userTypes 매핑
// 변경: MassMailTarget 행 기반으로 동적 collect

interface CollectInput {
  targets: { roleCode: string }[];  // MassMailTarget 행
  // ... (기타 입력)
}

export async function collectRecipients({ targets, ... }: CollectInput) {
  const targetRoleCodes = new Set(targets.map((t) => t.roleCode));

  // 각 사용자 소스(QSP/AS-IS/to-be) 에서 해당 권한 회원 collect
  // ... (기존 분기 변환)

  // recipient row INSERT 시 authRoleCode 에 user 의 권한 스냅샷 저장
  await prisma.massMailRecipient.createMany({
    data: users.map((u) => ({
      massMailId,
      email: u.email,
      userName: u.userName,
      authRoleCode: u.authRole,  // snapshot
    })),
  });
}
```

---

## 9. Test Plan (Design 단계 정밀)

### 9.1 마이그레이션 검증 (필수)

```sql
-- 검증 1: qp_roles isSystem 정합성
SELECT role_code, is_system, is_active FROM qp_roles
  WHERE role_code IN ('SUPER_ADMIN','ADMIN','GENERAL','1ST_STORE','2ND_STORE','SEKO');
-- 모든 row: is_system=TRUE, is_active=TRUE

-- 검증 2: ContentTarget 변환
SELECT
  (SELECT COUNT(*) FROM qp_content_targets WHERE role_code IS NULL) AS non_member_count,
  (SELECT COUNT(*) FROM qp_content_targets WHERE role_code IS NOT NULL) AS member_count;
-- (기존 target_type='non_member') vs 변환 후 일치

-- 검증 3: HomeNoticeTarget 정규화
SELECT COUNT(*) FROM qp_home_notice_targets;
-- 기존 boolean true 합계와 일치

-- 검증 4: MassMailTarget 정규화
SELECT COUNT(*) FROM qp_mass_mail_targets;

-- 검증 5: MassMailRecipient snapshot
SELECT COUNT(*) FROM qp_mass_mail_recipients WHERE auth_role_code IS NULL;
-- 0 이어야 함

-- 검증 6: FK 무결성
SELECT ct.role_code FROM qp_content_targets ct
  LEFT JOIN qp_roles r ON ct.role_code = r.role_code
  WHERE ct.role_code IS NOT NULL AND r.role_code IS NULL;
-- 0 이어야 함 (orphan 0)
```

### 9.2 단위 검증 (코드)

| 함수 | 시나리오 |
|---|---|
| `canAccessContent` | SUPER_ADMIN/ADMIN/1ST_STORE/2ND_STORE/SEKO/GENERAL/신규 D/비로그인 × 게시대상 (각 권한 + 비회원) |
| `resolveActiveRoleCodes` | isActive=true 모든 권한 (isSystem 무관) 반환 검증 |
| `validateAuthRole` | 6 기본 + 신규 D 활성 → true / 비활성 D → false / unknown → false |
| `PUT /api/roles/[roleCode]` 가드 | 6 기본 isActive 변경 거부 / 6 기본 roleCode 변경 거부 / 6 기본 roleName 변경 통과 / 추가 권한 자유 편집 |
| `POST /api/roles` 가드 | SYSTEM_ROLE_CODES 거부 / 운영자 isSystem=true 입력 무시 (false 강제) |

### 9.3 E2E 시각 검증 (필수 24+ 케이스)

권한관리 시나리오:
- [ ] 신규 권한 D 추가 (isActive=Y) → 콘텐츠/홈공지/대량메일 게시대상 옵션 즉시 노출
- [ ] D 비활성 (isActive=N) → 옵션 자동 숨김
- [ ] D 권한명 변경 → 4개 화면 라벨 즉시 갱신
- [ ] D 삭제 시도 → UI 버튼 없음 (Soft 정책)
- [ ] 6 기본 권한 사용여부 토글 시도 → UI disabled, 직접 PUT 호출 시 400
- [ ] 6 기본 권한 권한코드 변경 시도 → readonly, 직접 PUT 시 400
- [ ] 6 기본 권한 권한명 변경 → 정상

콘텐츠 접근 시나리오 (8 case):
- [ ] SUPER_ADMIN/ADMIN: 모든 게시대상 콘텐츠 200
- [ ] 6 기본 권한 (4종): 자기 권한 게시대상만 200, 타 권한 403
- [ ] 신규 D 부여 회원: D 게시대상 200, 비D 게시대상 403
- [ ] 비로그인: `roleCode IS NULL` 게시대상만 200

JWT 검증 시나리오:
- [ ] 신규 D 부여 회원 로그인 → 200, JWT 발급 정상
- [ ] D 가 비활성된 후 회원 로그인 → 권한 매핑 fallback 정책 적용

회귀 (필수):
- [ ] 콘텐츠 등록/수정/삭제/검색
- [ ] 홈공지 등록/수정/삭제/검색 + 동일기간 5건 한도(권한별)
- [ ] 대량메일 등록/송신/재송신
- [ ] 회원관리 일반회원 권한 변경

---

## 10. Implementation Order (단계별)

각 단계 완료 시 lint/typecheck 통과 확인.

| 순서 | 단계 | 산출물 | 검증 |
|:---:|---|---|---|
| 1 | schema.prisma 변경 | schema diff | `pnpm prisma generate` 통과 |
| 2 | migration.sql 작성 | `prisma/migrations/<ts>_target_dynamic_from_role/migration.sql` | dev DB dry-run + §9.1 SELECT 검증 |
| 3 | BE 헬퍼 (`canAccessContent`, `resolveActiveRoleCodes`) | `src/lib/auth.ts` | 단위 테스트 |
| 4 | 6 기본 권한 보호 가드 | `src/app/api/roles/[roleCode]/route.ts`, `src/app/api/roles/route.ts` | 단위 테스트 + 직접 PUT 호출 검증 |
| 5 | JWT authRole 동적 검증 | `src/lib/schemas/auth.ts`, `src/middleware.ts`, `src/app/api/auth/login/route.ts` | 신규 D 부여 회원 로그인 시각 검증 |
| 6 | 콘텐츠 BE 라우트 | `src/app/api/contents/**` | 회귀 검증 (등록/수정/삭제/검색) |
| 7 | 홈공지 BE 라우트 | `src/app/api/home-notices/**` | HomeNoticeTarget INSERT 검증 |
| 8 | 대량메일 BE 라우트 + collect-recipients | `src/app/api/admin/mass-mails/**`, `src/lib/mass-mail/collect-recipients.ts` | 발송 시각 검증 |
| 9 | FE `useTargetLabels` 동적화 | `src/hooks/use-target-labels.ts` | TanStack Query 로딩 UX 검증 |
| 10 | FE 4개 화면 통합 | 콘텐츠/홈공지/대량메일/권한관리 컴포넌트 | 4개 화면 시각 검증 |
| 11 | OpenAPI 동기화 | `src/lib/openapi.ts` | 스펙 vs 실 동작 일치 |
| 12 | 회귀 + E2E 시각 검증 | §9.3 24+ 케이스 | 누락 없음 확인 |

---

## 11. Related Documents

- **Plan Doc**: [target-dynamic-from-role.plan.md](../../01-plan/features/target-dynamic-from-role.plan.md)
- **선행 PR**: [PR #148](https://github.com/nalpari/qpartners-neo/pull/148), [PR #149](https://github.com/nalpari/qpartners-neo/pull/149)
- **선행 RBAC**: `docs/02-design/features/permission.design.md`, `docs/02-design/features/menu.design.md`
- **선행 코드**: `src/lib/auth-role.ts`, `src/hooks/use-target-labels.ts`, `src/app/api/admin/members/[id]/route.ts:305-309` (Redmine #2178)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 (Draft) | 2026-05-07 | Initial design. Plan v0.2 기반. 4개 영역 schema diff, 5단계 마이그레이션 SQL, BE 헬퍼 시그니처, JWT 동적 검증, FE 동적화, 6 기본 권한 보호 가드, RecipientAuthRole snapshot 처리, 24+ E2E 시나리오. NON_MEMBER nullable 단정 (`useTargetLabels.ts:15` 코드 의도 반영). | CK |
