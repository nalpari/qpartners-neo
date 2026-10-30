-- 형번(型番) 마스터 신설 — 검색기능 고도화 REQ-007 / REQ-008 / REQ-009.
--
-- 배경:
--   자료를 제품 모델번호(형번)로 찾을 수 있게 한다. 형번을 카테고리 체계로 관리하려 했으나
--   `/api/categories/route.ts` 가 3Depth 를 거부하고 `is_visible` 이 1Depth 전용이라
--   REQ-007 의 형번별 표시/비표시를 표현할 수 없다. 카테고리끼리 연결하는 구조도 없어
--   제품 상태를 형번에 붙일 수 없다. 따라서 별도 마스터로 분리하고, 카테고리에는
--   노출 플래그 1개만 추가한다.
--
-- 추가분:
--   1) qp_categories.is_product_list  제품일람 노출 플래그          (REQ-008)
--   2) qp_product_models              형번 마스터                   (REQ-007)
--   3) qp_content_product_models      자료 ↔ 형번 N:M               (REQ-009)
--
-- 형번 중복 비교는 (category_id, model_code) UNIQUE + utf8mb4_unicode_ci 가 담당한다:
--   - 대소문자 무시 (_ci)        → `HQJP-A44` == `hqjp-a44`
--   - 뒤 공백 무시 (PAD SPACE)   → `HQJP-A44 ` == `HQJP-A44`
--   앞 공백은 콜레이션이 처리하지 않으므로 애플리케이션에서 trim 한 값을 저장한다.
--   가운데 공백은 보존한다 — `栄信 SRシリーズ` 처럼 의미를 갖는 형번이 있어,
--   제거하면 서로 다른 형번이 중복으로 막힌다.
--
-- 형번 삭제 시 자료는 남기고 연결만 지운다(ON DELETE CASCADE on qp_content_product_models).
-- 연결을 남겨두면 존재하지 않는 형번이 자료 상세와 검색 필터에 유령으로 나타난다.
--
-- 기존 데이터 이행은 없다 — 운영 배포 시점부터 신규 등록·관리한다 (2026-10-01 확인).
-- 기존 환경 재적용이 안전하도록 IF NOT EXISTS 로 멱등 처리하고,
-- FK 는 CREATE TABLE 안에 명시적 이름으로 인라인 선언해 재실행 시 중복 생성되지 않게 한다.

-- 1) 카테고리 — 제품일람 노출 플래그
--    2026-10-08 현업 리뷰로 제품 카테고리 한정 → 전 카테고리 적용으로 확장(고객 확장성 요구).
--    실제 사용은 2Depth 한정이며, `is_visible`(1Depth 전용)·`is_active` 와는 독립된 축이다.
ALTER TABLE `qp_categories`
  ADD COLUMN IF NOT EXISTS `is_product_list` BOOLEAN NOT NULL DEFAULT false;

-- 2) 형번 마스터
CREATE TABLE IF NOT EXISTS `qp_product_models` (
    `id`          INTEGER      NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER      NOT NULL,
    `model_code`  VARCHAR(100) NOT NULL,
    `sort_order`  INTEGER      NOT NULL DEFAULT 1,
    `is_visible`  BOOLEAN      NOT NULL DEFAULT true,
    `created_at`  DATETIME(3)  NOT NULL DEFAULT UTC_TIMESTAMP(3),
    `created_by`  VARCHAR(255) NULL,
    `updated_at`  DATETIME(3)  NOT NULL,
    `updated_by`  VARCHAR(255) NULL,

    UNIQUE INDEX `qp_product_models_category_model_key`(`category_id`, `model_code`),
    INDEX `idx_category_sort`(`category_id`, `sort_order`),
    INDEX `idx_visible`(`is_visible`),
    PRIMARY KEY (`id`),
    CONSTRAINT `qp_product_models_category_id_fkey`
      FOREIGN KEY (`category_id`) REFERENCES `qp_categories`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) 자료 ↔ 형번 N:M
CREATE TABLE IF NOT EXISTS `qp_content_product_models` (
    `content_id`       INTEGER      NOT NULL,
    `product_model_id` INTEGER      NOT NULL,
    `created_at`       DATETIME(3)  NOT NULL DEFAULT UTC_TIMESTAMP(3),
    `created_by`       VARCHAR(255) NULL,

    INDEX `qp_content_product_models_model_content_idx`(`product_model_id`, `content_id`),
    PRIMARY KEY (`content_id`, `product_model_id`),
    CONSTRAINT `qp_content_product_models_content_id_fkey`
      FOREIGN KEY (`content_id`) REFERENCES `qp_contents`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `qp_content_product_models_product_model_id_fkey`
      FOREIGN KEY (`product_model_id`) REFERENCES `qp_product_models`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
