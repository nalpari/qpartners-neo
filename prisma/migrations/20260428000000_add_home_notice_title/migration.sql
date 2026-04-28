-- AddColumn (NOT NULL + DEFAULT '無題' 로 기존 row 자동 backfill)
ALTER TABLE `qp_home_notices`
  ADD COLUMN `title` VARCHAR(100) NOT NULL DEFAULT '無題';
