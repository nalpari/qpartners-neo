/*
  Warnings:

  - Made the column `company_name_kana` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `zipcode` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `address1` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tel` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `last_name_kana` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `first_name_kana` on table `qp_general_users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `qp_general_users` MODIFY `company_name_kana` VARCHAR(255) NOT NULL,
    MODIFY `zipcode` VARCHAR(10) NOT NULL,
    MODIFY `address1` VARCHAR(500) NOT NULL,
    MODIFY `tel` VARCHAR(20) NOT NULL,
    MODIFY `last_name_kana` VARCHAR(100) NOT NULL,
    MODIFY `first_name_kana` VARCHAR(100) NOT NULL;
