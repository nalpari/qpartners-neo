-- DropForeignKey
ALTER TABLE `qp_categories` DROP FOREIGN KEY `qp_categories_parent_id_fkey`;

-- AddForeignKey
ALTER TABLE `qp_categories` ADD CONSTRAINT `qp_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `qp_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
