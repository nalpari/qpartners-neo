/*
  Warnings:

  - You are about to drop the column `address1` on the `qp_general_users` table. All the data in the column will be lost.
  - You are about to drop the column `address2` on the `qp_general_users` table. All the data in the column will be lost.
  - Added the required column `address` to the `qp_general_users` table without a default value. This is not possible if the table is not empty.

*/
-- Step 1: Add new columns (nullable first)
ALTER TABLE `qp_general_users`
    ADD COLUMN `address` VARCHAR(500) NULL,
    ADD COLUMN `address_detail` VARCHAR(500) NULL;

-- Step 2: Backfill from old columns
UPDATE `qp_general_users`
SET
  `address` = COALESCE(`address1`, ''),
  `address_detail` = `address2`
WHERE `address` IS NULL;

-- Step 3: Set NOT NULL after backfill
ALTER TABLE `qp_general_users`
    MODIFY COLUMN `address` VARCHAR(500) NOT NULL;

-- Step 4: Drop old columns
ALTER TABLE `qp_general_users`
    DROP COLUMN `address1`,
    DROP COLUMN `address2`;
