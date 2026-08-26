# 콘텐츠 갱신일 오염 데이터 보정 — 참고용 SQL

> **이 문서의 SQL 은 자동 실행되지 않습니다.** 필요 시 담당자가 수동으로 적용하기 위한 참고 자료입니다.
>
> | 환경 | 상태 |
> |---|---|
> | 개발 (`development`) | **적용 완료** — 754건 보정 (2026-08-25) |
> | 운영 | **미적용으로 진행** — 업무 판단에 따라 기존 데이터는 보정하지 않음 |

관련 이슈: Redmine #2476 / PR [#282](https://github.com/nalpari/qpartners-neo/pull/282)

---

## 1. 배경

콘텐츠 상세·목록의 갱신일(更新日) 노출 조건은 `updatedAt !== createdAt` 입니다. 아래 두 경로에서
실제 수정이 없었는데도 이 조건이 성립해, 갱신일 표시 · UPDATE 뱃지 · 갱신일 정렬이 오염됐습니다.

| 원인 | 내용 |
|---|---|
| **A. 등록 시점부터 어긋남** | `created_at` 은 DB default(`CURRENT_TIMESTAMP(3)`), `updated_at` 은 Prisma `@updatedAt` 이 채워 왕복 지연만큼(실측 1~3ms) 벌어짐 |
| **C. 조회수 증가가 UPDATE 문** | Prisma `@updatedAt` 은 UPDATE 의 *내용*을 보지 않으므로, 조회수 +1 에도 `updated_at = 지금` 이 함께 나감 |

**코드 측 오염원은 아래 3커밋으로 제거됐습니다.** 이 문서의 SQL 은 그 이전에 이미 오염된 **기존 행**만을 대상으로 합니다.

| 커밋 | 내용 |
|---|---|
| `b1bc31c` | 등록 시 `created_at` / `updated_at` 을 같은 시각으로 명시 INSERT (A) |
| `e2f9eb8` | 조회수 증가를 raw UPDATE 로 전환 — `updated_at` 미접촉, TOCTOU 제거 (C) |
| `12170a7` | 조회수 증가 실패가 상세 조회를 막지 않도록 분리 |

---

## 2. 판정 기준 — `updated_by IS NULL`

앱에서 `Content` 를 수정하는 경로는 PUT(`src/app/api/contents/[id]/route.ts`)과 soft delete 둘뿐이고,
최초 커밋(`0dd1989`) 이래 두 경로 모두 항상 `updated_by` 를 세팅해 왔습니다.

따라서 `updated_by IS NULL` = **"앱에서 수정된 적 없음"** 이 성립합니다.
조회수 증가 경로만 `updated_by` 를 남기지 않으므로, 오염된 행은 정확히 이 조건에 걸립니다.

---

## 3. 적용 전 확인 (필수)

**어떤 환경이든 이 SELECT 를 먼저 실행하고, 결과를 확인한 뒤에만 보정을 진행합니다.**

```sql
SELECT COUNT(*)                                                 AS 전체,
       SUM(updated_by IS NULL)                                  AS 수정이력없음,
       SUM(updated_by IS NULL     AND updated_at <> created_at) AS 보정대상,
       SUM(updated_by IS NOT NULL AND updated_at =  created_at) AS 반드시_0
  FROM qp_contents;
```

| 결과 | 판정 |
|---|---|
| `보정대상` > 0 | 오염 행 존재 — 4장의 보정 SQL 대상 |
| `보정대상` = 0 | 보정할 것 없음 — 실행해도 no-op |
| `반드시_0` ≠ 0 | **2장의 판정 전제가 깨진 환경. 보정을 적용하지 말 것.** 앱 밖에서 `updated_at` 을 직접 변경한 이력이 있다는 뜻이며, 그대로 실행하면 실제 갱신 시각이 `created_at` 으로 영구히 덮어써집니다 |

---

## 4. 보정 SQL

### 4.1 원본 값 백업 (되돌릴 수 있도록 먼저 실행)

보정은 `updated_at` 원본 값을 **덮어쓰고 버립니다.** 스냅샷 없이는 원복이 불가능합니다.

```sql
CREATE TABLE qp_contents_updated_at_backup_20260826 AS
SELECT id, updated_at
  FROM qp_contents
 WHERE updated_by IS NULL
   AND updated_at <> created_at;
```

### 4.2 보정

```sql
UPDATE qp_contents
   SET updated_at = created_at
 WHERE updated_by IS NULL
   AND updated_at <> created_at;
```

### 4.3 사후 검증

```sql
SELECT COUNT(*)                                                 AS 전체,
       SUM(updated_by IS NULL     AND updated_at <> created_at) AS 오염행_0이어야_함,
       SUM(updated_by IS NOT NULL)                              AS 수정이력행_보정전과_동일해야_함
  FROM qp_contents;
```

### 4.4 원복 (필요 시)

```sql
UPDATE qp_contents c
  JOIN qp_contents_updated_at_backup_20260826 b ON b.id = c.id
   SET c.updated_at = b.updated_at;
```

---

## 5. 안전성

- `updated_by IS NOT NULL` 인 행은 건드리지 않습니다 → **실제 수정 이력은 보존**됩니다.
- `updated_at` 컬럼에 `ON UPDATE CURRENT_TIMESTAMP` 가 없고(`information_schema` EXTRA 공백),
  `@updatedAt` 은 Prisma 앱 레벨 동작이라 raw UPDATE 는 값을 그대로 기록합니다.
- `WHERE` 로 대상을 좁히므로 재실행해도 두 번째부터는 0건 no-op (멱등).

---

## 6. 왜 마이그레이션이 아니라 문서인가

이 프로젝트는 **배포 파이프라인에 `prisma migrate` 단계가 없습니다** (Jenkinsfile / Dockerfile /
docker-compose 모두). 런타임 이미지는 `.next/standalone` 만 담고 있어 컨테이너 안에 Prisma CLI 자체가
없습니다 — [`docs/mass-mail-batch-deploy.md`](./mass-mail-batch-deploy.md) §3.1 참조.

`prisma/migrations/` 에 두면 `prisma migrate deploy` 가 **미적용 마이그레이션을 전부 실행**하므로,
향후 다른 스키마 변경을 적용하는 시점에 이 데이터 보정이 **의도치 않게 함께 실행**됩니다.
운영을 미적용으로 유지하기로 한 결정과 어긋나므로, 실행 가능한 마이그레이션이 아닌 참고 문서로 둡니다.

---

## 관련 문서

- [`docs/mass-mail-batch-deploy.md`](./mass-mail-batch-deploy.md) — 수동 마이그레이션 적용 절차 선례
