-- 게시기간(qp_content_targets.start_at/end_at) 을 일 단위 → 시 단위 판정으로 전환하면서
-- 기존 데이터의 노출 기간을 보존하기 위한 보정.
--
-- 배경:
--   종전 판정은 `end_at >= 오늘 자정` 이라 "종료일 당일 종일 노출" 을 의미했다.
--   시각 비교(`end_at >= now`)로 바꾸면 자정(00:00)으로 저장된 기존 행은
--   종료일 당일 0시에 만료되어 하루치 노출이 사라진다.
--
-- 보정:
--   JST 기준 정확히 자정인 end_at 을 같은 날 23시로 옮긴다.
--   (분 단위를 쓰지 않는 정책이라 23:59 가 아닌 23:00 — 시 단위 표기와 일치)
--   DB 는 UTC 저장이므로 JST 자정 = UTC 15:00 인 행이 대상이다.
--
--   신규 판정은 "종료 시각이 속한 시간대의 끝까지" 이므로(auth.ts canAccessContent,
--   contents/route.ts) 23:00 은 24:00 까지 노출을 뜻한다 = 종전 "종료일 당일 종일" 과 동일.
--   정각 비교였다면 여기서 마지막 날 23:00~24:00 한 시간이 깎였다.
--
-- start_at 은 보정 불필요:
--   종전 판정 `start_at < 내일 자정` 과 신규 판정 `start_at <= now` 모두
--   자정 저장 행을 그 날 00시부터 통과시켜 결과가 같다.

-- JST 자정 = UTC 15:00 (오프셋 고정 +09:00, DST 없음).
-- CONVERT_TZ 는 MariaDB 타임존 테이블이 적재돼 있어야 하므로 직접 비교로 대체한다.
UPDATE qp_content_targets
SET end_at = DATE_ADD(end_at, INTERVAL 23 HOUR)
WHERE end_at IS NOT NULL
  AND TIME(end_at) = '15:00:00';
