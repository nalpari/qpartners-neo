-- CreateTable
CREATE TABLE `qp_general_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_name` VARCHAR(255) NOT NULL,
    `company_name_kana` VARCHAR(255) NULL,
    `zipcode` VARCHAR(10) NULL,
    `address1` VARCHAR(500) NULL,
    `address2` VARCHAR(500) NULL,
    `tel` VARCHAR(20) NULL,
    `fax` VARCHAR(20) NULL,
    `corporate_number` VARCHAR(20) NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name_kana` VARCHAR(100) NULL,
    `first_name_kana` VARCHAR(100) NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `department` VARCHAR(100) NULL,
    `job_title` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `qp_general_users_email_key`(`email`),
    INDEX `idx_company_name`(`company_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_info` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `user_type` VARCHAR(20) NOT NULL,
    `user_role` VARCHAR(50) NOT NULL,
    `two_factor_enabled` BOOLEAN NOT NULL DEFAULT true,
    `two_factor_verified_at` DATETIME(3) NULL,
    `login_notification` BOOLEAN NOT NULL DEFAULT true,
    `attribute_change_notification` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
    `withdrawn` BOOLEAN NOT NULL DEFAULT false,
    `withdrawn_at` DATETIME(3) NULL,
    `withdrawn_reason` TEXT NULL,
    `last_login_at` DATETIME(3) NULL,
    `terms_agreed_at` DATETIME(3) NULL,
    `initial_setup_done` BOOLEAN NOT NULL DEFAULT false,
    `password_changed_at` DATETIME(3) NULL,
    `id_save_enabled` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_user_type`(`user_type`),
    INDEX `idx_user_role`(`user_role`),
    INDEX `idx_status`(`status`),
    UNIQUE INDEX `idx_user_source_id`(`user_source`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_code` VARCHAR(50) NOT NULL,
    `role_name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `qp_roles_role_code_key`(`role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_role_menu_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_code` VARCHAR(50) NOT NULL,
    `menu_code` VARCHAR(50) NOT NULL,
    `can_read` BOOLEAN NOT NULL DEFAULT false,
    `can_create` BOOLEAN NOT NULL DEFAULT false,
    `can_update` BOOLEAN NOT NULL DEFAULT false,
    `can_delete` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `idx_role_menu`(`role_code`, `menu_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contents` (
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content_id` INTEGER NOT NULL,
    `target_type` ENUM('first_dealer', 'second_dealer', 'constructor', 'general', 'non_member') NOT NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,

    INDEX `idx_content_id`(`content_id`),
    INDEX `idx_target_type`(`target_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_id` INTEGER NULL,
    `category_code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `is_internal_only` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_category_code_key`(`category_code`),
    INDEX `idx_parent_id`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_categories` (
    `content_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,

    PRIMARY KEY (`content_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_attachments` (
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
CREATE TABLE `password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_key`(`token`),
    INDEX `idx_user`(`user_source`, `external_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `two_factor_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
    `external_user_id` VARCHAR(255) NOT NULL,
    `code` VARCHAR(6) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user`(`user_source`, `external_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `home_notices` (
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
CREATE TABLE `mass_mails` (
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
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_status`(`status`),
    INDEX `idx_sent_at`(`sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mass_mail_recipients` (
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
CREATE TABLE `mass_mail_attachments` (
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
CREATE TABLE `download_logs` (
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
CREATE TABLE `inquiries` (
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
CREATE TABLE `menus` (
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
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `menus_menu_code_key`(`menu_code`),
    INDEX `idx_parent_id`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `code_headers` (
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
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `code_headers_header_code_key`(`header_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `code_details` (
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
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_header_id`(`header_id`),
    UNIQUE INDEX `idx_header_code`(`header_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `qp_role_menu_permissions` ADD CONSTRAINT `qp_role_menu_permissions_role_code_fkey` FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_role_menu_permissions` ADD CONSTRAINT `qp_role_menu_permissions_menu_code_fkey` FOREIGN KEY (`menu_code`) REFERENCES `menus`(`menu_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_targets` ADD CONSTRAINT `content_targets_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_categories` ADD CONSTRAINT `content_categories_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_categories` ADD CONSTRAINT `content_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_attachments` ADD CONSTRAINT `content_attachments_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mass_mail_recipients` ADD CONSTRAINT `mass_mail_recipients_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mass_mail_attachments` ADD CONSTRAINT `mass_mail_attachments_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `download_logs` ADD CONSTRAINT `download_logs_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `download_logs` ADD CONSTRAINT `download_logs_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `content_attachments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menus` ADD CONSTRAINT `menus_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `menus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `code_details` ADD CONSTRAINT `code_details_header_id_fkey` FOREIGN KEY (`header_id`) REFERENCES `code_headers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
