-- qp_download_logs.attachment_id 를 NULL 허용 + FK ON DELETE SET NULL 로 교체.
--
-- 배경: prisma/schema.prisma 에서는 `DownloadLog.attachment` 가 `onDelete: SetNull`
--       (`attachmentId Int?`) 로 선언되어 있으나, MariaDB 환경에서 `prisma db push` 가
--       컬럼 타입 변경 후 FK 의 ON DELETE 절을 재생성하지 않아 실제 DB 제약이 이전
--       상태(NOT NULL + RESTRICT)로 남는 환경이 발견되었다. 이 상태에서는
--       첨부파일 삭제 시 `prisma.contentAttachment.delete()` 가 P2003 FK violation
--       으로 실패한다.
--
-- 본 마이그레이션은 해당 드리프트를 정식 migrate 흐름에 통합하여 모든 환경
-- (local / CI / dev / staging / prod)에서 일관된 FK 동작을 보장한다.

-- 1) 기존 FK 제거
ALTER TABLE `qp_download_logs` DROP FOREIGN KEY `qp_download_logs_attachment_id_fkey`;

-- 2) 컬럼을 NULL 허용으로 변경 (ON DELETE SET NULL 전제 조건)
ALTER TABLE `qp_download_logs` MODIFY COLUMN `attachment_id` INT NULL;

-- 3) FK 재생성 — ON DELETE SET NULL
ALTER TABLE `qp_download_logs`
  ADD CONSTRAINT `qp_download_logs_attachment_id_fkey`
  FOREIGN KEY (`attachment_id`) REFERENCES `qp_content_attachments`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
