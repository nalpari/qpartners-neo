/*
  Warnings:

  - You are about to drop the column `address1` on the `qp_general_users` table. All the data in the column will be lost.
  - You are about to drop the column `address2` on the `qp_general_users` table. All the data in the column will be lost.
  - Added the required column `address` to the `qp_general_users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `qp_general_users` DROP COLUMN `address1`,
    DROP COLUMN `address2`,
    ADD COLUMN `address` VARCHAR(500) NOT NULL,
    ADD COLUMN `address_detail` VARCHAR(500) NULL;
