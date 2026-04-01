-- Rename header_id to header_alias (data preserved via CHANGE COLUMN)
ALTER TABLE `qp_code_headers` CHANGE COLUMN `header_id` `header_alias` VARCHAR(50) NOT NULL;

-- Add missing audit columns
ALTER TABLE `qp_content_attachments` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ADD COLUMN `updated_by` VARCHAR(255) NULL;
ALTER TABLE `qp_content_targets` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ADD COLUMN `updated_by` VARCHAR(255) NULL;
ALTER TABLE `qp_inquiries` ADD COLUMN `created_by` VARCHAR(255) NULL;
ALTER TABLE `qp_mass_mail_attachments` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ADD COLUMN `updated_by` VARCHAR(255) NULL;
ALTER TABLE `qp_mass_mail_recipients` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ADD COLUMN `created_by` VARCHAR(255) NULL;
ALTER TABLE `qp_mass_mails` ADD COLUMN `opt_out` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `qp_password_reset_tokens` ADD COLUMN `created_by` VARCHAR(255) NULL;
ALTER TABLE `qp_two_factor_codes` ADD COLUMN `created_by` VARCHAR(255) NULL;
