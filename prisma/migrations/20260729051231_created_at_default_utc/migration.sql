-- AlterTable
ALTER TABLE `qp_roles` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_role_menu_permissions` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_menus` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_code_headers` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_code_details` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_contents` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_content_targets` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_categories` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_content_categories` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_content_attachments` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_content_inline_images` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_password_reset_tokens` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_two_factor_codes` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_home_notices` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_mass_mails` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_mass_mail_attachments` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_mass_mail_recipients` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_download_logs` MODIFY `downloaded_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_inquiries` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Test` MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `qp_interface_log` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3);

