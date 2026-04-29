-- qp_two_factor_codes 스키마 동기화
-- schema.prisma 와 DB drift 를 해소: 컬럼명/ENUM/사이즈/누락 컬럼.
--
-- 기존 row 는 일회성 2FA 코드(만료 또는 미검증) 라 보존 가치 없음 — 사용자 승인 후 전체 삭제.
-- ENUM 값(qsp/seko/general → ADMIN/STORE/SEKO/GENERAL) 변환 충돌 방지를 위해 ALTER 전 DELETE 선행.
--
-- ───────────────────────────────────────────────────────────────────
-- 운영 배포 절차 (인프라 담당자용)
-- ───────────────────────────────────────────────────────────────────
-- MariaDB DDL 은 암묵적 커밋이 발생해 트랜잭션 롤백이 불가하므로,
-- 다음 절차를 반드시 순서대로 수행할 것.
--
--   1) 백업 (필수)
--      mysqldump -h <host> -u <user> -p <db> qp_two_factor_codes \
--        > qp_two_factor_codes_backup_$(date +%Y%m%d_%H%M%S).sql
--
--   2) 마이그레이션 적용
--      pnpm prisma migrate deploy
--
--   3) 인덱스 반영 검증
--      MariaDB CHANGE COLUMN 시 인덱스는 컬럼 ID 기준이라 자동 갱신되지만,
--      적용 후 다음 명령으로 (user_type, user_id) 매핑 여부를 명시적으로 확인.
--        SHOW INDEX FROM qp_two_factor_codes;
--      Prisma 스키마 drift 여부는 다음 명령으로 추가 검증 가능.
--        pnpm prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
--
--   4) 부분 실패 시 즉시 롤백
--      step 2 의 통합 ALTER / step 3 의 ADD COLUMN 중 어느 한 쪽이 실패하면
--      파일 하단의 "긴급 롤백 스크립트" 를 그대로 실행하여 이전 스키마로 복구.
-- ───────────────────────────────────────────────────────────────────

-- 1. 기존 row 전체 삭제 (ENUM 변환 충돌 방지)
DELETE FROM `qp_two_factor_codes`;

-- 2. 컬럼명 + ENUM 값 변경 + code 사이즈 확장 — 단일 ALTER 로 통합 (테이블 리빌드 1회)
--    user_source(ENUM qsp/seko/general)  → user_type(ENUM ADMIN/STORE/SEKO/GENERAL)
--    external_user_id(VARCHAR 255)       → user_id(VARCHAR 255)
--    code(VARCHAR 6)                     → code(VARCHAR 64)  -- HMAC-SHA256 hex 저장 대응
--    인덱스 idx_user 는 컬럼 ID 기준이라 RENAME 후 자동으로 (user_type, user_id) 로 매핑됨.
ALTER TABLE `qp_two_factor_codes`
  CHANGE COLUMN `user_source` `user_type` ENUM('ADMIN', 'STORE', 'SEKO', 'GENERAL') NOT NULL,
  CHANGE COLUMN `external_user_id` `user_id` VARCHAR(255) NOT NULL,
  MODIFY COLUMN `code` VARCHAR(64) NOT NULL;

-- 3. 누락 컬럼 추가
--    verified_at: 검증 완료 시각 (verifyToken 성공 시 set)
--    attempts:    검증 시도 횟수 (brute-force 방어, MAX_VERIFY_ATTEMPTS=5 비교용)
ALTER TABLE `qp_two_factor_codes`
  ADD COLUMN `verified_at` DATETIME(3) NULL,
  ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────
-- 긴급 롤백 스크립트 (DDL 부분 실패 또는 운영 이슈 발생 시 수동 실행)
-- ───────────────────────────────────────────────────────────────────
-- ALTER TABLE `qp_two_factor_codes`
--   DROP COLUMN `verified_at`,
--   DROP COLUMN `attempts`;
--
-- ALTER TABLE `qp_two_factor_codes`
--   CHANGE COLUMN `user_type` `user_source` ENUM('qsp', 'seko', 'general') NOT NULL,
--   CHANGE COLUMN `user_id` `external_user_id` VARCHAR(255) NOT NULL,
--   MODIFY COLUMN `code` VARCHAR(6) NOT NULL;
-- ───────────────────────────────────────────────────────────────────
