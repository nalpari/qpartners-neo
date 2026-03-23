/*
  Warnings:

  - You are about to drop the `categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `code_details` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `code_headers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `content_attachments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `content_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `content_targets` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `download_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `home_notices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inquiries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `mass_mail_attachments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `mass_mail_recipients` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `mass_mails` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `menus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `password_reset_tokens` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `two_factor_codes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `categories` DROP FOREIGN KEY `categories_parent_id_fkey`;

-- DropForeignKey
ALTER TABLE `code_details` DROP FOREIGN KEY `code_details_header_id_fkey`;

-- DropForeignKey
ALTER TABLE `content_attachments` DROP FOREIGN KEY `content_attachments_content_id_fkey`;

-- DropForeignKey
ALTER TABLE `content_categories` DROP FOREIGN KEY `content_categories_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `content_categories` DROP FOREIGN KEY `content_categories_content_id_fkey`;

-- DropForeignKey
ALTER TABLE `content_targets` DROP FOREIGN KEY `content_targets_content_id_fkey`;

-- DropForeignKey
ALTER TABLE `download_logs` DROP FOREIGN KEY `download_logs_attachment_id_fkey`;

-- DropForeignKey
ALTER TABLE `download_logs` DROP FOREIGN KEY `download_logs_content_id_fkey`;

-- DropForeignKey
ALTER TABLE `mass_mail_attachments` DROP FOREIGN KEY `mass_mail_attachments_mass_mail_id_fkey`;

-- DropForeignKey
ALTER TABLE `mass_mail_recipients` DROP FOREIGN KEY `mass_mail_recipients_mass_mail_id_fkey`;

-- DropForeignKey
ALTER TABLE `menus` DROP FOREIGN KEY `menus_parent_id_fkey`;

-- DropForeignKey
ALTER TABLE `qp_role_menu_permissions` DROP FOREIGN KEY `qp_role_menu_permissions_menu_code_fkey`;

-- DropIndex
DROP INDEX `qp_role_menu_permissions_menu_code_fkey` ON `qp_role_menu_permissions`;

-- DropTable
DROP TABLE `categories`;

-- DropTable
DROP TABLE `code_details`;

-- DropTable
DROP TABLE `code_headers`;

-- DropTable
DROP TABLE `content_attachments`;

-- DropTable
DROP TABLE `content_categories`;

-- DropTable
DROP TABLE `content_targets`;

-- DropTable
DROP TABLE `contents`;

-- DropTable
DROP TABLE `download_logs`;

-- DropTable
DROP TABLE `home_notices`;

-- DropTable
DROP TABLE `inquiries`;

-- DropTable
DROP TABLE `mass_mail_attachments`;

-- DropTable
DROP TABLE `mass_mail_recipients`;

-- DropTable
DROP TABLE `mass_mails`;

-- DropTable
DROP TABLE `menus`;

-- DropTable
DROP TABLE `password_reset_tokens`;

-- DropTable
DROP TABLE `two_factor_codes`;

-- CreateTable
CREATE TABLE `qp_contents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `author_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `author_id` VARCHAR(255) NOT NULL,
    `author_department` VARCHAR(100) NULL,
    `updater_source` ENUM('qsp', 'seko', 'general') NULL,
    `updater_id` VARCHAR(255) NULL,
    `approver_level` TINYINT NULL,
    `title` VARCHAR(500) NOT NULL,
    `body` MEDIUMTEXT NULL,
    `status` ENUM('draft', 'published', 'deleted') NOT NULL DEFAULT 'draft',
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_status`(`status`),
    INDEX `idx_published_at`(`published_at`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_author`(`author_source`, `author_id`),
    INDEX `idx_status_published`(`status`, `published_at`),
    INDEX `idx_author_department`(`author_department`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_content_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content_id` INTEGER NOT NULL,
    `target_type` ENUM('first_dealer', 'second_dealer', 'constructor', 'general', 'non_member') NOT NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,

    INDEX `idx_content_id`(`content_id`),
    INDEX `idx_target_type`(`target_type`),
    INDEX `idx_target_period`(`target_type`, `start_at`, `end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_id` INTEGER NULL,
    `category_code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `is_internal_only` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    UNIQUE INDEX `qp_categories_category_code_key`(`category_code`),
    INDEX `idx_parent_id`(`parent_id`),
    INDEX `idx_active_sort`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_content_categories` (
    `content_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,

    PRIMARY KEY (`content_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_content_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content_id` INTEGER NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` BIGINT NULL,
    `mime_type` VARCHAR(100) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_content_id`(`content_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `qp_password_reset_tokens_token_key`(`token`),
    INDEX `idx_user`(`user_source`, `external_user_id`),
    INDEX `idx_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_two_factor_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `code` VARCHAR(6) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user`(`user_source`, `external_user_id`),
    INDEX `idx_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_home_notices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `target_admin` BOOLEAN NOT NULL DEFAULT false,
    `target_first_dealer` BOOLEAN NOT NULL DEFAULT false,
    `target_second_dealer` BOOLEAN NOT NULL DEFAULT false,
    `target_constructor` BOOLEAN NOT NULL DEFAULT false,
    `target_general` BOOLEAN NOT NULL DEFAULT false,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `content` TEXT NOT NULL,
    `url` VARCHAR(500) NULL,
    `status` ENUM('scheduled', 'active', 'ended') NOT NULL DEFAULT 'scheduled',
    `author_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `author_id` VARCHAR(255) NOT NULL,
    `updater_source` ENUM('qsp', 'seko', 'general') NULL,
    `updater_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_status`(`status`),
    INDEX `idx_period`(`start_at`, `end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_mass_mails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sender_name` VARCHAR(255) NOT NULL,
    `author_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `author_id` VARCHAR(255) NOT NULL,
    `target_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `target_admin` BOOLEAN NOT NULL DEFAULT false,
    `target_first_dealer` BOOLEAN NOT NULL DEFAULT false,
    `target_second_dealer` BOOLEAN NOT NULL DEFAULT false,
    `target_constructor` BOOLEAN NOT NULL DEFAULT false,
    `target_general` BOOLEAN NOT NULL DEFAULT false,
    `subject` VARCHAR(500) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `status` ENUM('draft', 'sent') NOT NULL DEFAULT 'draft',
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_status`(`status`),
    INDEX `idx_sent_at`(`sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_mass_mail_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mass_mail_id` INTEGER NOT NULL,
    `recipient_type` ENUM('cc', 'bcc') NOT NULL,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,

    INDEX `idx_mass_mail_id`(`mass_mail_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_mass_mail_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mass_mail_id` INTEGER NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_mass_mail_id`(`mass_mail_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_download_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `content_id` INTEGER NOT NULL,
    `attachment_id` INTEGER NOT NULL,
    `downloaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user`(`user_source`, `external_user_id`),
    INDEX `idx_downloaded_at`(`downloaded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_inquiries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `company_name` VARCHAR(255) NOT NULL,
    `user_name` VARCHAR(200) NOT NULL,
    `tel` VARCHAR(20) NULL,
    `email` VARCHAR(255) NOT NULL,
    `inquiry_type` VARCHAR(100) NULL,
    `title` VARCHAR(500) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user`(`user_source`, `external_user_id`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_menus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_id` INTEGER NULL,
    `menu_code` VARCHAR(50) NOT NULL,
    `menu_name` VARCHAR(100) NOT NULL,
    `page_url` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `show_in_top_nav` BOOLEAN NOT NULL DEFAULT true,
    `show_in_mobile` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    UNIQUE INDEX `qp_menus_menu_code_key`(`menu_code`),
    INDEX `idx_parent_id`(`parent_id`),
    INDEX `idx_active_sort`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_code_headers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `header_code` VARCHAR(20) NOT NULL,
    `header_id` VARCHAR(50) NOT NULL,
    `header_name` VARCHAR(255) NOT NULL,
    `rel_code1` VARCHAR(50) NULL,
    `rel_code2` VARCHAR(50) NULL,
    `rel_code3` VARCHAR(50) NULL,
    `rel_num1` DECIMAL(15, 2) NULL,
    `rel_num2` DECIMAL(15, 2) NULL,
    `rel_num3` DECIMAL(15, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    UNIQUE INDEX `qp_code_headers_header_code_key`(`header_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_code_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `header_id` INTEGER NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `display_code` VARCHAR(20) NOT NULL,
    `code_name` VARCHAR(255) NOT NULL,
    `code_name_etc` VARCHAR(255) NULL,
    `rel_code1` VARCHAR(50) NULL,
    `rel_code2` VARCHAR(50) NULL,
    `rel_num1` DECIMAL(15, 2) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_header_id`(`header_id`),
    UNIQUE INDEX `idx_header_code`(`header_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `qp_role_menu_permissions` ADD CONSTRAINT `qp_role_menu_permissions_menu_code_fkey` FOREIGN KEY (`menu_code`) REFERENCES `qp_menus`(`menu_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_targets` ADD CONSTRAINT `qp_content_targets_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_categories` ADD CONSTRAINT `qp_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `qp_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_categories` ADD CONSTRAINT `qp_content_categories_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_categories` ADD CONSTRAINT `qp_content_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `qp_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_attachments` ADD CONSTRAINT `qp_content_attachments_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_recipients` ADD CONSTRAINT `qp_mass_mail_recipients_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `qp_mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_attachments` ADD CONSTRAINT `qp_mass_mail_attachments_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `qp_mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_download_logs` ADD CONSTRAINT `qp_download_logs_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_download_logs` ADD CONSTRAINT `qp_download_logs_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `qp_content_attachments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_menus` ADD CONSTRAINT `qp_menus_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `qp_menus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_code_details` ADD CONSTRAINT `qp_code_details_header_id_fkey` FOREIGN KEY (`header_id`) REFERENCES `qp_code_headers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
