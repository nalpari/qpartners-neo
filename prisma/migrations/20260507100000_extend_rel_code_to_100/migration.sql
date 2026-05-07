-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Extend rel_code1/2/3 from VARCHAR(50) to VARCHAR(100)
-- 대상: qp_code_headers, qp_code_details
-- 사유: 외부 코드 시스템 매핑 시 50자 한계 도달 — 100자 확장으로 여유 확보
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── qp_code_headers ───
ALTER TABLE `qp_code_headers`
  MODIFY COLUMN `rel_code1` VARCHAR(100) NULL,
  MODIFY COLUMN `rel_code2` VARCHAR(100) NULL,
  MODIFY COLUMN `rel_code3` VARCHAR(100) NULL;

-- ─── qp_code_details ───
ALTER TABLE `qp_code_details`
  MODIFY COLUMN `rel_code1` VARCHAR(100) NULL,
  MODIFY COLUMN `rel_code2` VARCHAR(100) NULL,
  MODIFY COLUMN `rel_code3` VARCHAR(100) NULL;
