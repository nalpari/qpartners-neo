-- AlterTable
ALTER TABLE `categories` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `code_details` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `code_headers` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `mass_mails` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `menus` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `qp_role_menu_permissions` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `qp_roles` ADD COLUMN `created_by` VARCHAR(255) NULL,
    ADD COLUMN `updated_by` VARCHAR(255) NULL;
