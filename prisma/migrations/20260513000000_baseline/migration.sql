-- CreateTable
CREATE TABLE `qp_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_code` VARCHAR(50) NOT NULL,
    `role_name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    UNIQUE INDEX `qp_roles_role_code_key`(`role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_role_menu_permissions` (
    `role_code` VARCHAR(50) NOT NULL,
    `menu_code` VARCHAR(50) NOT NULL,
    `can_read` BOOLEAN NOT NULL DEFAULT false,
    `can_create` BOOLEAN NOT NULL DEFAULT false,
    `can_update` BOOLEAN NOT NULL DEFAULT false,
    `can_delete` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `qp_role_menu_permissions_menu_code_fkey`(`menu_code`),
    PRIMARY KEY (`role_code`, `menu_code`)
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
    `header_alias` VARCHAR(50) NOT NULL,
    `header_name` VARCHAR(255) NOT NULL,
    `rel_code1` VARCHAR(100) NULL,
    `rel_code2` VARCHAR(100) NULL,
    `rel_code3` VARCHAR(100) NULL,
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
    `rel_code1` VARCHAR(100) NULL,
    `rel_code2` VARCHAR(100) NULL,
    `rel_code3` VARCHAR(100) NULL,
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

-- CreateTable
CREATE TABLE `qp_contents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `author_department` VARCHAR(100) NULL,
    `approver_level` TINYINT NULL,
    `title` VARCHAR(500) NOT NULL,
    `body` MEDIUMTEXT NULL,
    `status` ENUM('draft', 'published', 'deleted') NOT NULL DEFAULT 'draft',
    `published_at` DATETIME(3) NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_status`(`status`),
    INDEX `idx_published_at`(`published_at`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_user`(`user_type`, `user_id`),
    INDEX `idx_status_published`(`status`, `published_at`),
    INDEX `idx_author_department`(`author_department`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_content_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content_id` INTEGER NOT NULL,
    `role_code` VARCHAR(50) NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_target_period`(`role_code`, `start_at`, `end_at`),
    UNIQUE INDEX `idx_content_target`(`content_id`, `role_code`),
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
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,

    INDEX `qp_content_categories_category_content_idx`(`category_id`, `content_id`),
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
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_content_id`(`content_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_content_inline_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content_id` INTEGER NULL,
    `owner_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `owner_user_id` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` BIGINT NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_content_id`(`content_id`),
    INDEX `idx_owner`(`owner_type`, `owner_user_id`, `content_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `login_id` VARCHAR(255) NULL,
    `token` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,

    UNIQUE INDEX `qp_password_reset_tokens_token_key`(`token`),
    INDEX `idx_user`(`user_type`, `user_id`),
    INDEX `idx_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_two_factor_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `verified_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_user`(`user_type`, `user_id`),
    INDEX `idx_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_home_notices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `title` VARCHAR(100) NOT NULL DEFAULT '無題',
    `content` TEXT NOT NULL,
    `url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_period`(`start_at`, `end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_home_notice_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `home_notice_id` INTEGER NOT NULL,
    `role_code` VARCHAR(50) NOT NULL,

    INDEX `idx_notice_role`(`role_code`),
    UNIQUE INDEX `uq_notice_role`(`home_notice_id`, `role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_mass_mails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `sender_name` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(500) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `status` ENUM('draft', 'pending', 'sending', 'sent', 'send_failed') NOT NULL DEFAULT 'draft',
    `sent_at` DATETIME(3) NULL,
    `sent_total` INTEGER NOT NULL DEFAULT 0,
    `sent_success` INTEGER NOT NULL DEFAULT 0,
    `sent_failed` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `created_by_name` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,
    `opt_out` BOOLEAN NOT NULL DEFAULT false,

    INDEX `idx_status`(`status`),
    INDEX `idx_sent_at`(`sent_at`),
    INDEX `idx_status_created_at`(`status`, `created_at` DESC),
    INDEX `idx_status_updated_at`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_mass_mail_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mass_mail_id` INTEGER NOT NULL,
    `role_code` VARCHAR(50) NOT NULL,

    INDEX `idx_mail_role`(`role_code`),
    UNIQUE INDEX `uq_mail_role`(`mass_mail_id`, `role_code`),
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
    `created_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(255) NULL,

    INDEX `idx_mass_mail_id`(`mass_mail_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_mass_mail_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mass_mail_id` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `user_name` VARCHAR(255) NULL,
    `auth_role_code` VARCHAR(50) NOT NULL,
    `status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    `sent_at` DATETIME(3) NULL,
    `error_message` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_mass_mail_status`(`mass_mail_id`, `status`),
    INDEX `idx_mm_status_retry`(`mass_mail_id`, `status`, `retry_count`),
    UNIQUE INDEX `uq_mass_mail_email`(`mass_mail_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_download_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `content_id` INTEGER NOT NULL,
    `attachment_id` INTEGER NULL,
    `downloaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user`(`user_type`, `user_id`),
    INDEX `idx_downloaded_at`(`downloaded_at`),
    INDEX `qp_download_logs_attachment_id_fkey`(`attachment_id`),
    INDEX `qp_download_logs_content_id_fkey`(`content_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_inquiries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NULL,
    `user_id` VARCHAR(255) NULL,
    `company_name` VARCHAR(255) NOT NULL,
    `user_name` VARCHAR(200) NOT NULL,
    `tel` VARCHAR(20) NULL,
    `email` VARCHAR(255) NOT NULL,
    `inquiry_type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NULL,

    INDEX `idx_user`(`user_type`, `user_id`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Test` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qp_interface_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trace_id` VARCHAR(36) NOT NULL,
    `system` VARCHAR(20) NOT NULL,
    `direction` VARCHAR(10) NOT NULL,
    `api_name` VARCHAR(50) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `request_url` VARCHAR(2000) NOT NULL,
    `request_body` TEXT NULL,
    `response_status` INTEGER NOT NULL,
    `response_body` TEXT NULL,
    `result_code` VARCHAR(10) NULL,
    `duration_ms` INTEGER NOT NULL,
    `caller_route` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(255) NULL,
    `user_type` VARCHAR(20) NULL,
    `error_message` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(255) NOT NULL DEFAULT 'SYSTEM',

    INDEX `qp_interface_log_trace_id_idx`(`trace_id`),
    INDEX `qp_interface_log_system_api_name_created_at_idx`(`system`, `api_name`, `created_at`),
    INDEX `qp_interface_log_caller_route_created_at_idx`(`caller_route`, `created_at`),
    INDEX `qp_interface_log_result_code_idx`(`result_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `qp_role_menu_permissions` ADD CONSTRAINT `qp_role_menu_permissions_menu_code_fkey` FOREIGN KEY (`menu_code`) REFERENCES `qp_menus`(`menu_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_role_menu_permissions` ADD CONSTRAINT `qp_role_menu_permissions_role_code_fkey` FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_menus` ADD CONSTRAINT `qp_menus_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `qp_menus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_code_details` ADD CONSTRAINT `qp_code_details_header_id_fkey` FOREIGN KEY (`header_id`) REFERENCES `qp_code_headers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_targets` ADD CONSTRAINT `qp_content_targets_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_targets` ADD CONSTRAINT `qp_content_targets_role_code_fkey` FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_categories` ADD CONSTRAINT `qp_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `qp_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_categories` ADD CONSTRAINT `qp_content_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `qp_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_categories` ADD CONSTRAINT `qp_content_categories_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_attachments` ADD CONSTRAINT `qp_content_attachments_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_content_inline_images` ADD CONSTRAINT `qp_content_inline_images_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_home_notice_targets` ADD CONSTRAINT `qp_home_notice_targets_home_notice_id_fkey` FOREIGN KEY (`home_notice_id`) REFERENCES `qp_home_notices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_home_notice_targets` ADD CONSTRAINT `qp_home_notice_targets_role_code_fkey` FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_targets` ADD CONSTRAINT `qp_mass_mail_targets_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `qp_mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_targets` ADD CONSTRAINT `qp_mass_mail_targets_role_code_fkey` FOREIGN KEY (`role_code`) REFERENCES `qp_roles`(`role_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_attachments` ADD CONSTRAINT `qp_mass_mail_attachments_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `qp_mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_mass_mail_recipients` ADD CONSTRAINT `qp_mass_mail_recipients_mass_mail_id_fkey` FOREIGN KEY (`mass_mail_id`) REFERENCES `qp_mass_mails`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_download_logs` ADD CONSTRAINT `qp_download_logs_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `qp_content_attachments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qp_download_logs` ADD CONSTRAINT `qp_download_logs_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

