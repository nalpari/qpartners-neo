-- qp_two_factor_codes 스키마 동기화
-- schema.prisma 와 DB drift 를 해소: 컬럼명/ENUM/사이즈/누락 컬럼.
--
-- 기존 row 는 일회성 2FA 코드(만료 또는 미검증) 라 보존 가치 없음 — 사용자 승인 후 전체 삭제.
-- ENUM 값(qsp/seko/general → ADMIN/STORE/SEKO/GENERAL) 변환 충돌 방지를 위해 ALTER 전 DELETE 선행.

-- 1. 기존 row 전체 삭제 (ENUM 변환 충돌 방지)
DELETE FROM `qp_two_factor_codes`;

-- 2. 컬럼명 + ENUM 값 변경
--    user_source(ENUM qsp/seko/general)  → user_type(ENUM ADMIN/STORE/SEKO/GENERAL)
--    external_user_id(VARCHAR 255)       → user_id(VARCHAR 255)
--    인덱스 idx_user 는 컬럼 ID 기준이라 RENAME 후 자동으로 (user_type, user_id) 로 매핑됨.
ALTER TABLE `qp_two_factor_codes`
  CHANGE COLUMN `user_source` `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
  CHANGE COLUMN `external_user_id` `user_id` VARCHAR(255) NOT NULL;

-- 3. code 컬럼 사이즈 확장 — HMAC-SHA256 hex(64자) 저장 대응
ALTER TABLE `qp_two_factor_codes`
  MODIFY COLUMN `code` VARCHAR(64) NOT NULL;

-- 4. 누락 컬럼 추가
--    verified_at: 검증 완료 시각 (verifyToken 성공 시 set)
--    attempts:    검증 시도 횟수 (brute-force 방어, MAX_VERIFY_ATTEMPTS=5 비교용)
ALTER TABLE `qp_two_factor_codes`
  ADD COLUMN `verified_at` DATETIME(3) NULL,
  ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;
