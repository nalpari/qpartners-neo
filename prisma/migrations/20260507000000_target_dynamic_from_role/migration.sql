-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Target Dynamic from Role — 4개 화면 게시대상 동적화
-- ContentTarget enum → nullable roleCode (FK)
-- HomeNotice/MassMail boolean 6개 → 정규화 신규 테이블 (HomeNoticeTarget/MassMailTarget)
-- MassMailRecipient.authRole enum → String snapshot (FK 없음)
-- qp_roles.isSystem 컬럼 추가 + 6 기본 권한 보호 마킹
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── Step 1: qp_roles 에 isSystem 컬럼 추가 + 6 기본 권한 보호 마킹 ───

-- AlterTable
ALTER TABLE `qp_roles` ADD COLUMN `is_system` BOOLEAN NOT NULL DEFAULT false;

-- 6 기본 권한 isSystem=TRUE + isActive=TRUE 강제
UPDATE `qp_roles` SET `is_system` = true, `is_active` = true
WHERE `role_code` IN ('SUPER_ADMIN', 'ADMIN', 'GENERAL', '1ST_STORE', '2ND_STORE', 'SEKO');

-- 검증 쿼리 (참고)
-- SELECT COUNT(*) FROM `qp_roles` WHERE `is_system` = true; -- expected: 6


-- ─── Step 2: ContentTarget enum → nullable roleCode ───

-- AlterTable: role_code 컬럼 추가 (nullable)
ALTER TABLE `qp_content_targets` ADD COLUMN `role_code` VARCHAR(50) NULL;

-- 기존 enum 값 → roleCode 변환 (non_member → NULL 유지)
UPDATE `qp_content_targets` SET `role_code` = '1ST_STORE'  WHERE `target_type` = '1st_store';
UPDATE `qp_content_targets` SET `role_code` = '2ND_STORE'  WHERE `target_type` = '2nd_store';
UPDATE `qp_content_targets` SET `role_code` = 'SEKO'       WHERE `target_type` = 'seko';
UPDATE `qp_content_targets` SET `role_code` = 'GENERAL'    WHERE `target_type` = 'general';
-- non_member 행은 role_code 가 NULL 로 유지됨 (비회원 sentinel)

-- FK 잠시 DROP — `idx_content_target` (content_id, target_type) 가 FK supporting index 라
-- 그대로 DROP 시 errno 1553 (Cannot drop index needed in a foreign key constraint).
-- 인덱스/컬럼 정리 완료 후 새 unique index `(content_id, role_code)` 가 supporting index 가 되도록 재생성.
ALTER TABLE `qp_content_targets` DROP FOREIGN KEY `qp_content_targets_content_id_fkey`;

-- 기존 인덱스 제거
DROP INDEX `idx_content_target` ON `qp_content_targets`;
DROP INDEX `idx_target_period` ON `qp_content_targets`;

-- target_type 컬럼 제거 (ENUM TargetType 자동 정리됨 — MySQL ENUM 은 컬럼 inline)
ALTER TABLE `qp_content_targets` DROP COLUMN `target_type`;

-- 새 인덱스 (FK supporting index 역할도 겸함 — 첫 컬럼 content_id 일치)
CREATE UNIQUE INDEX `idx_content_target` ON `qp_content_targets`(`content_id`, `role_code`);
CREATE INDEX `idx_target_period` ON `qp_content_targets`(`role_code`, `start_at`, `end_at`);

-- FK 재생성 (Step 2 시작 시 DROP 한 content_id FK + 신규 role_code FK)
ALTER TABLE `qp_content_targets`
  ADD CONSTRAINT `qp_content_targets_content_id_fkey`
  FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `qp_content_targets`
  ADD CONSTRAINT `qp_content_targets_role_code_fkey`
  FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Step 3: HomeNoticeTarget 정규화 (boolean 6개 → 행 변환) ───

-- CreateTable
CREATE TABLE `qp_home_notice_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `home_notice_id` INTEGER NOT NULL,
    `role_code` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `uq_notice_role`(`home_notice_id`, `role_code`),
    INDEX `idx_notice_role`(`role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- boolean 6개 → 행 변환
INSERT INTO `qp_home_notice_targets` (`home_notice_id`, `role_code`)
  SELECT `id`, 'SUPER_ADMIN' FROM `qp_home_notices` WHERE `target_super_admin` = true;
INSERT INTO `qp_home_notice_targets` (`home_notice_id`, `role_code`)
  SELECT `id`, 'ADMIN' FROM `qp_home_notices` WHERE `target_admin` = true;
INSERT INTO `qp_home_notice_targets` (`home_notice_id`, `role_code`)
  SELECT `id`, '1ST_STORE' FROM `qp_home_notices` WHERE `target_first_store` = true;
INSERT INTO `qp_home_notice_targets` (`home_notice_id`, `role_code`)
  SELECT `id`, '2ND_STORE' FROM `qp_home_notices` WHERE `target_second_store` = true;
INSERT INTO `qp_home_notice_targets` (`home_notice_id`, `role_code`)
  SELECT `id`, 'SEKO' FROM `qp_home_notices` WHERE `target_constructor` = true;
INSERT INTO `qp_home_notice_targets` (`home_notice_id`, `role_code`)
  SELECT `id`, 'GENERAL' FROM `qp_home_notices` WHERE `target_general` = true;

-- AddForeignKey
ALTER TABLE `qp_home_notice_targets`
  ADD CONSTRAINT `qp_home_notice_targets_home_notice_id_fkey`
  FOREIGN KEY (`home_notice_id`) REFERENCES `qp_home_notices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `qp_home_notice_targets`
  ADD CONSTRAINT `qp_home_notice_targets_role_code_fkey`
  FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- HomeNotice 의 boolean 6개 컬럼 제거
ALTER TABLE `qp_home_notices`
  DROP COLUMN `target_super_admin`,
  DROP COLUMN `target_admin`,
  DROP COLUMN `target_first_store`,
  DROP COLUMN `target_second_store`,
  DROP COLUMN `target_constructor`,
  DROP COLUMN `target_general`;

-- 검증 쿼리 (참고)
-- SELECT
--   (SELECT COUNT(*) FROM `qp_home_notice_targets`) AS actual,
--   (SELECT
--     SUM(CAST(`target_super_admin` AS UNSIGNED) + CAST(`target_admin` AS UNSIGNED) +
--         CAST(`target_first_store` AS UNSIGNED) + CAST(`target_second_store` AS UNSIGNED) +
--         CAST(`target_constructor` AS UNSIGNED) + CAST(`target_general` AS UNSIGNED))
--    FROM `qp_home_notices_backup`) AS expected;
-- expected = actual 이어야 함 (백업 테이블 있는 경우)


-- ─── Step 4: MassMailTarget 정규화 + MassMailRecipient snapshot 변환 ───

-- CreateTable
CREATE TABLE `qp_mass_mail_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mass_mail_id` INTEGER NOT NULL,
    `role_code` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `uq_mail_role`(`mass_mail_id`, `role_code`),
    INDEX `idx_mail_role`(`role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- boolean 6개 → 행 변환
INSERT INTO `qp_mass_mail_targets` (`mass_mail_id`, `role_code`)
  SELECT `id`, 'SUPER_ADMIN' FROM `qp_mass_mails` WHERE `target_super_admin` = true;
INSERT INTO `qp_mass_mail_targets` (`mass_mail_id`, `role_code`)
  SELECT `id`, 'ADMIN' FROM `qp_mass_mails` WHERE `target_admin` = true;
INSERT INTO `qp_mass_mail_targets` (`mass_mail_id`, `role_code`)
  SELECT `id`, '1ST_STORE' FROM `qp_mass_mails` WHERE `target_first_store` = true;
INSERT INTO `qp_mass_mail_targets` (`mass_mail_id`, `role_code`)
  SELECT `id`, '2ND_STORE' FROM `qp_mass_mails` WHERE `target_second_store` = true;
INSERT INTO `qp_mass_mail_targets` (`mass_mail_id`, `role_code`)
  SELECT `id`, 'SEKO' FROM `qp_mass_mails` WHERE `target_constructor` = true;
INSERT INTO `qp_mass_mail_targets` (`mass_mail_id`, `role_code`)
  SELECT `id`, 'GENERAL' FROM `qp_mass_mails` WHERE `target_general` = true;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_targets`
  ADD CONSTRAINT `qp_mass_mail_targets_mass_mail_id_fkey`
  FOREIGN KEY (`mass_mail_id`) REFERENCES `qp_mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `qp_mass_mail_targets`
  ADD CONSTRAINT `qp_mass_mail_targets_role_code_fkey`
  FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- MassMail 의 boolean 6개 컬럼 제거
ALTER TABLE `qp_mass_mails`
  DROP COLUMN `target_super_admin`,
  DROP COLUMN `target_admin`,
  DROP COLUMN `target_first_store`,
  DROP COLUMN `target_second_store`,
  DROP COLUMN `target_constructor`,
  DROP COLUMN `target_general`;

-- MassMailRecipient.authRole enum → authRoleCode String snapshot (FK 없음)
ALTER TABLE `qp_mass_mail_recipients` ADD COLUMN `auth_role_code` VARCHAR(50) NULL;

UPDATE `qp_mass_mail_recipients` SET `auth_role_code` = 'SUPER_ADMIN'  WHERE `auth_role` = 'SUPER_ADMIN';
UPDATE `qp_mass_mail_recipients` SET `auth_role_code` = 'ADMIN'        WHERE `auth_role` = 'ADMIN';
UPDATE `qp_mass_mail_recipients` SET `auth_role_code` = '1ST_STORE'    WHERE `auth_role` = 'FIRST_STORE';
UPDATE `qp_mass_mail_recipients` SET `auth_role_code` = '2ND_STORE'    WHERE `auth_role` = 'SECOND_STORE';
UPDATE `qp_mass_mail_recipients` SET `auth_role_code` = 'SEKO'         WHERE `auth_role` = 'SEKO';
UPDATE `qp_mass_mail_recipients` SET `auth_role_code` = 'GENERAL'      WHERE `auth_role` = 'GENERAL';

-- 검증: NULL 0건 확인 (참고)
-- SELECT COUNT(*) FROM `qp_mass_mail_recipients` WHERE `auth_role_code` IS NULL; -- expected: 0

-- auth_role 컬럼 제거 + auth_role_code NOT NULL
ALTER TABLE `qp_mass_mail_recipients` DROP COLUMN `auth_role`;
ALTER TABLE `qp_mass_mail_recipients` MODIFY COLUMN `auth_role_code` VARCHAR(50) NOT NULL;
-- snapshot 이라 FK 없음 (수신 시점 권한 보존, 권한 변경/비활성화 무관)


-- ─── Step 5: ENUM 타입 정리 ───
-- MySQL/MariaDB 에서 ENUM 은 컬럼 정의에 inline 저장됨 (별도 타입 객체 X).
-- target_type (Step 2) / auth_role (Step 4) 컬럼 제거 시 자동 정리됨.
-- 별도 DROP TYPE 명령 불필요.
