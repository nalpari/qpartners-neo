/*
  Warnings:

  - Made the column `company_name_kana` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `zipcode` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `address1` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tel` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `last_name_kana` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `first_name_kana` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill NULL values before NOT NULL constraint
UPDATE `qp_general_users` SET
  `company_name_kana` = COALESCE(`company_name_kana`, ''),
  `zipcode` = COALESCE(`zipcode`, ''),
  `address1` = COALESCE(`address1`, ''),
  `tel` = COALESCE(`tel`, ''),
  `last_name_kana` = COALESCE(`last_name_kana`, ''),
  `first_name_kana` = COALESCE(`first_name_kana`, '')
WHERE
  `company_name_kana` IS NULL
  OR `zipcode` IS NULL
  OR `address1` IS NULL
  OR `tel` IS NULL
  OR `last_name_kana` IS NULL
  OR `first_name_kana` IS NULL;

-- AlterTable
ALTER TABLE `qp_general_users` MODIFY `company_name_kana` VARCHAR(255) NOT NULL,
    MODIFY `zipcode` VARCHAR(10) NOT NULL,
    MODIFY `address1` VARCHAR(500) NOT NULL,
    MODIFY `tel` VARCHAR(20) NOT NULL,
    MODIFY `last_name_kana` VARCHAR(100) NOT NULL,
    MODIFY `first_name_kana` VARCHAR(100) NOT NULL;
