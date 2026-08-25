-- 콘텐츠 갱신일 오염 데이터 보정 (#2476)
--
-- [배경]
-- 상세 조회의 조회수 증가를 `prisma.content.update({ data: { viewCount: { increment: 1 } } })`
-- 로 처리하던 시절, Prisma `@updatedAt` 이 부수효과로 `updated_at` 을 현재 시각으로 밀어올렸다.
-- 그 결과 한 번도 수정된 적 없는 콘텐츠가 "조회만 당해도" 갱신일을 갖게 되어,
-- 갱신일 표시 · UPDATE 뱃지 · 갱신일 정렬이 오염됐다.
--
-- 코드 측 오염원은 아래 3커밋으로 제거됐고, 이 파일은 그 이전에 이미 오염된 기존 행을 되돌린다.
--   b1bc31c  등록 시 created_at/updated_at 을 같은 시각으로 명시 INSERT
--   e2f9eb8  조회수 증가를 raw UPDATE 로 전환 (updated_at 미접촉, TOCTOU 제거)
--   12170a7  조회수 증가 실패가 상세 조회를 막지 않도록 분리
--
-- [판정 기준: updated_by IS NULL]
-- 앱에서 Content 를 수정하는 경로는 PUT(contents/[id]/route.ts) 과 soft delete 둘뿐이고,
-- 최초 커밋(0dd1989) 이래 두 경로 모두 항상 `updated_by` 를 세팅해 왔다.
-- 따라서 `updated_by IS NULL` = "앱에서 수정된 적 없음" 이 성립한다.
-- 조회수 증가 경로만 updated_by 를 남기지 않았으므로, 오염된 행은 정확히 이 조건에 걸린다.
--
-- [안전성]
-- - `updated_by IS NOT NULL` 인 행은 건드리지 않는다 → 실제 수정 이력은 보존된다.
-- - `updated_at` 컬럼에 ON UPDATE CURRENT_TIMESTAMP 가 없고(information_schema EXTRA 공백),
--   `@updatedAt` 은 Prisma 앱 레벨 동작이라 raw UPDATE 는 값을 그대로 기록한다.
-- - WHERE 로 대상을 좁히므로 재실행해도 두 번째부터는 0건 no-op (멱등).
--
-- [적용 전 확인 — 운영 포함 모든 환경에서 먼저 실행할 것]
--   SELECT COUNT(*) total,
--          SUM(updated_at <> created_at AND updated_by IS NULL)    AS 보정대상,
--          SUM(updated_at =  created_at AND updated_by IS NOT NULL) AS 반드시_0
--     FROM qp_contents;
--   `반드시_0` 이 0 이 아니면 위 판정 전제가 깨진 것이므로 이 마이그레이션을 적용하지 말 것.

UPDATE `qp_contents`
   SET `updated_at` = `created_at`
 WHERE `updated_by` IS NULL
   AND `updated_at` <> `created_at`;
