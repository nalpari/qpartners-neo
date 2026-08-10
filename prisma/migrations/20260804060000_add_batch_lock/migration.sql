-- 배치 분산 락 테이블 추가.
-- 대량메일 자동 재시도 배치를 프로세스 내 setInterval 에서 외부 스케줄러 호출
-- (POST /api/batch/mass-mail) 로 전환하면서, 운영 2 인스턴스 중 한 곳만 실행되도록
-- 원자적 UPDATE 기반 리스 락을 사용한다.
-- 기존 환경 재적용이 안전하도록 IF NOT EXISTS 로 멱등 처리.

CREATE TABLE IF NOT EXISTS `qp_batch_locks` (
  `name`       VARCHAR(64)  NOT NULL,
  `expires_at` DATETIME(3)  NOT NULL,
  `holder`     VARCHAR(191) NOT NULL,
  `updated_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
