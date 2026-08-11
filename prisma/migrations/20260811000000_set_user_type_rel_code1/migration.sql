-- 회원관리 검색 「会員タイプ」 SelectBox 노출 대상을 USER_TYPE 공통코드의 rel_code1 로 제어한다.
--   'Y'        = 검색 조건에 노출
--   그 외/NULL = 미노출
--
-- 시공점(SEKO)은 별도 화면에서 관리하며, 회원 목록 API 의 memberListQuerySchema
-- (src/lib/schemas/member.ts) 가 SEKO 를 허용하지 않는다. 검색 셀렉트에 노출되면
-- 선택 시 400 이 발생하므로 'N' 으로 둔다.
--
-- 공통코드 데이터는 코드관리 화면에서 운영되어 저장소에 시드가 없다. 그런데 애플리케이션이
-- rel_code1='Y' 를 전제하게 되었으므로(GET /api/codes/lookup?headerCode=USER_TYPE&relCode1=Y),
-- 값이 비어 있는 환경에서는 필터 결과가 0 건이 되어 회원유형 검색 셀렉트가 통째로 비활성화된다.
-- 이를 막기 위해 배포 시점의 기준값을 여기서 확정한다.
--
-- 주의:
--  - UPDATE 만 수행하므로 대상 행이 없는 환경에서도 안전하고, 재적용해도 결과가 같다(멱등).
--  - 아래 4 개 코드만 대상으로 한다. 이후 추가되는 USER_TYPE 코드의 rel_code1 은 NULL 이므로
--    검색 셀렉트에 노출되지 않는다(opt-in). 노출이 필요하면 코드관리에서 'Y' 를 지정한다.
--  - updated_by 는 건드리지 않는다 — 코드관리 API 도 이 컬럼을 설정하지 않는다.

UPDATE `qp_code_details` `d`
  JOIN `qp_code_headers` `h` ON `h`.`id` = `d`.`header_id`
SET `d`.`rel_code1` = 'Y',
    `d`.`updated_at` = UTC_TIMESTAMP(3)
WHERE `h`.`header_code` = 'USER_TYPE'
  AND `d`.`code` IN ('ADMIN', 'STORE', 'GENERAL');

UPDATE `qp_code_details` `d`
  JOIN `qp_code_headers` `h` ON `h`.`id` = `d`.`header_id`
SET `d`.`rel_code1` = 'N',
    `d`.`updated_at` = UTC_TIMESTAMP(3)
WHERE `h`.`header_code` = 'USER_TYPE'
  AND `d`.`code` = 'SEKO';
