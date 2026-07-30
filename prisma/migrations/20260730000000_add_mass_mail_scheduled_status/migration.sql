-- 대량메일 예약발송 상태값 'scheduled' 추가.
-- schema.prisma 의 MailStatus enum 에는 'scheduled' 가 있으나 baseline 마이그레이션에는 누락되어
-- DB status ENUM 에 값이 없어 예약발송 저장 시 "Data truncated for column 'status'" (1265) 오류 발생.
-- 순서는 schema.prisma 정의와 동일하게 'pending' 과 'sending' 사이에 삽입.
-- scheduled_send_at 컬럼과 idx_status_scheduled_send_at 인덱스는 baseline 에 이미 존재하므로 건드리지 않음.
ALTER TABLE `qp_mass_mails`
  MODIFY `status` ENUM('draft', 'pending', 'scheduled', 'sending', 'sent', 'send_failed') NOT NULL DEFAULT 'draft';
