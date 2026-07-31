-- 대량메일 예약발송(scheduled send) 스키마 반영.
-- schema.prisma 의 MassMail 에는 status='scheduled' 값 / scheduled_send_at 컬럼 /
-- idx_status_scheduled_send_at 인덱스가 정의되어 있으나 baseline·이후 마이그레이션에 누락되어 있었음.
-- 신규 환경에서 마이그레이션만으로 배포 시 컬럼/인덱스/enum 값이 없어 예약발송 쿼리가
-- "Unknown column 'scheduled_send_at'" / "Data truncated for column 'status'" 로 실패하므로 여기서 함께 보정.
-- 기존 환경(수동 반영 완료)에서도 재적용이 안전하도록 IF NOT EXISTS 로 멱등 처리.

-- 1) status ENUM 에 'scheduled' 추가 (schema.prisma 정의 순서와 동일하게 'pending' 과 'sending' 사이).
--    MODIFY 는 동일 정의 재적용 시 no-op 이라 멱등.
ALTER TABLE `qp_mass_mails`
  MODIFY `status` ENUM('draft', 'pending', 'scheduled', 'sending', 'sent', 'send_failed') NOT NULL DEFAULT 'draft';

-- 2) 예약발송 지정 일시 컬럼 (Prisma DateTime? → datetime(3) NULL).
ALTER TABLE `qp_mass_mails`
  ADD COLUMN IF NOT EXISTS `scheduled_send_at` DATETIME(3) NULL AFTER `status`;

-- 3) 예약 도래 스캔 핫 패스 인덱스 — auto-retry-batch 가 (status, scheduled_send_at) 로 3분마다 스캔.
ALTER TABLE `qp_mass_mails`
  ADD INDEX IF NOT EXISTS `idx_status_scheduled_send_at` (`status`, `scheduled_send_at`);
