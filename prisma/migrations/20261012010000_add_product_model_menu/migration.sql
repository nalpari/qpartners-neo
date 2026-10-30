-- 형번관리 메뉴 + RBAC 권한 행 추가 — 검색기능 고도화 REQ-007.
--
-- 왜 seed 로 하지 않는가:
--   `prisma/seed.mjs` 의 `buildPermissions()` 는 6역할 × 전체 메뉴를
--   `ON DUPLICATE KEY UPDATE can_read=VALUES(can_read), ...` 로 덮어쓴다.
--   권한 값의 정본은 `/admin/permissions` 화면이므로, seed 를 실행하면
--   운영자가 화면에서 조정해 둔 값이 전부 seed 기준으로 리셋된다.
--   seed 는 신규 환경용으로만 동기화해 두고, 기존 환경 반영은 이 마이그레이션이 담당한다.
--   (동일 논리의 선례: 20260811000000_set_user_type_rel_code1)
--
-- 멱등성:
--   `INSERT ... SELECT ... WHERE NOT EXISTS` 로 기존 행을 건드리지 않는다.
--   `ON DUPLICATE KEY UPDATE` 를 쓰지 않는 이유도 같다 — 재실행 시 운영자 설정을 덮지 않아야 한다.
--
-- 권한 정책 (사용자 확정 2026-10-12): 슈퍼관리자/관리자만, 기존 콘텐츠 게시판 관리와 동일.
--   SUPER_ADMIN / ADMIN       → CRUD 전부
--   1ST_STORE / 2ND_STORE / SEKO / GENERAL → 전부 false
--   `ADM_CATEGORY` 와 동일한 취급이다.
--
-- sortOrder 는 맨 뒤(8). 목업은 カテゴリ管理 다음(5번째)이지만 기존 3행
-- (ADM_PERMISSION/ADM_MENU/ADM_CODE)의 sort_order 를 밀면 운영자가 메뉴관리 화면에서
-- 조정해 둔 순서를 덮어쓰게 된다. 탭 위치는 실제 이행 시점에 메뉴관리 화면에서 조정한다.

-- 1) 메뉴 행 — ADMIN(1Depth) 하위 2Depth 로 등록
INSERT INTO `qp_menus`
  (`parent_id`, `menu_code`, `menu_name`, `page_url`, `is_active`,
   `show_in_top_nav`, `show_in_mobile`, `sort_order`, `created_at`, `updated_at`, `created_by`)
SELECT
  (SELECT `id` FROM (SELECT `id` FROM `qp_menus` WHERE `menu_code` = 'ADMIN') AS `p`),
  'ADM_PRODUCT_MODEL', '型番管理', '/admin/product-models', 1,
  1, 1, 8, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), 'SYSTEM'
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `menu_code` FROM `qp_menus` WHERE `menu_code` = 'ADM_PRODUCT_MODEL') AS `e`
);

-- 2) 권한 행 — SUPER_ADMIN / ADMIN 만 CRUD, 나머지 역할은 전부 false.
--    `qp_roles` 에 실재하는 역할에만 넣는다(역할 추가/삭제 이력과 무관하게 동작).
INSERT INTO `qp_role_menu_permissions`
  (`role_code`, `menu_code`, `can_read`, `can_create`, `can_update`, `can_delete`,
   `created_at`, `updated_at`, `created_by`)
SELECT
  `r`.`role_code`,
  'ADM_PRODUCT_MODEL',
  CASE WHEN `r`.`role_code` IN ('SUPER_ADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN `r`.`role_code` IN ('SUPER_ADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN `r`.`role_code` IN ('SUPER_ADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN `r`.`role_code` IN ('SUPER_ADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), 'SYSTEM'
FROM `qp_roles` `r`
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT `role_code`, `menu_code` FROM `qp_role_menu_permissions`
     WHERE `menu_code` = 'ADM_PRODUCT_MODEL'
  ) AS `e`
  WHERE `e`.`role_code` = `r`.`role_code`
);
