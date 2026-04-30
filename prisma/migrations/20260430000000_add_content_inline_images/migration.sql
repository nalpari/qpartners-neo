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

-- AddForeignKey
ALTER TABLE `qp_content_inline_images` ADD CONSTRAINT `qp_content_inline_images_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
