-- 형번관리 탭을 카테고리관리 다음(5번째)으로 이동 — 2026-10-28 사용자 지시.
--
-- 배경:
--   `20261012010000_add_product_model_menu` 는 형번관리를 **맨 뒤(sort_order=8)** 에 넣었다.
--   근거는 「기존 3행(ADM_PERMISSION/ADM_MENU/ADM_CODE)의 순서를 밀면 운영자가 메뉴관리
--   화면에서 조정해 둔 순서를 덮어쓴다」였는데, 2026-10-28 실측에서 **dev·운영 양쪽 모두
--   seed 기본값 그대로**임이 확인됐다 — 덮어쓸 운영자 설정이 없다.
--   목업 03 과 요구사항의 탭 배치는 カテゴリ管理 다음이다.
--
-- 멱등성:
--   상대 이동(`sort_order + 1`)이 아니라 **목표값을 직접 지정**한다. 몇 번 재실행해도
--   결과가 같다. 상대 이동은 재실행마다 순서가 밀려 나간다.
--
-- ⚠️ 이 마이그레이션 이후 운영자가 메뉴관리 화면에서 순서를 바꾸면 그 값이 정본이다.
--    마이그레이션은 기록이 남아 재실행되지 않으므로 운영자 설정을 다시 덮지 않는다.

-- 1) 형번관리 → 5 (カテゴリ管理 4 다음)
UPDATE `qp_menus` `m`
  JOIN `qp_menus` `p` ON `p`.`id` = `m`.`parent_id`
SET `m`.`sort_order` = 5, `m`.`updated_at` = UTC_TIMESTAMP(3)
WHERE `p`.`menu_code` = 'ADMIN' AND `m`.`menu_code` = 'ADM_PRODUCT_MODEL';

-- 2) 뒤로 밀리는 3행 — 목표값 직접 지정
UPDATE `qp_menus` `m`
  JOIN `qp_menus` `p` ON `p`.`id` = `m`.`parent_id`
SET `m`.`sort_order` = 6, `m`.`updated_at` = UTC_TIMESTAMP(3)
WHERE `p`.`menu_code` = 'ADMIN' AND `m`.`menu_code` = 'ADM_PERMISSION';

UPDATE `qp_menus` `m`
  JOIN `qp_menus` `p` ON `p`.`id` = `m`.`parent_id`
SET `m`.`sort_order` = 7, `m`.`updated_at` = UTC_TIMESTAMP(3)
WHERE `p`.`menu_code` = 'ADMIN' AND `m`.`menu_code` = 'ADM_MENU';

UPDATE `qp_menus` `m`
  JOIN `qp_menus` `p` ON `p`.`id` = `m`.`parent_id`
SET `m`.`sort_order` = 8, `m`.`updated_at` = UTC_TIMESTAMP(3)
WHERE `p`.`menu_code` = 'ADMIN' AND `m`.`menu_code` = 'ADM_CODE';
