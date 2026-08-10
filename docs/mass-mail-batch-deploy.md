# 대량메일 배치 — 배포 · 운영 가이드

> **범위**: 대량메일 자동 재시도 배치**만**. 프로젝트 전반의 배포 절차는 [ci-cd-pipeline.md](./ci-cd-pipeline.md),
> 설계 상세는 [02-design/features/mass-mail-send.design.md §4.6](./02-design/features/mass-mail-send.design.md) 참조.
>
> **대상**: 이 배치를 신규 환경에 배포하거나 운영해야 하는 담당자.

---

## 1. 무엇이 바뀌었나

**이전**: 앱이 기동할 때 `src/instrumentation.ts` 가 `setInterval(runBatchOnce, 3분)` 을 등록.

**문제**: 운영은 컨테이너 2개(`qpartners-app-1`:5000, `qpartners-app-2`:5001)로 뜨는데,
각 인스턴스가 **독립적으로 타이머를 돌려** 같은 대량메일을 이중 발송했다.

**현재**: 프로세스 내 타이머를 제거하고, 외부 스케줄러가 `POST /api/batch/mass-mail` 을 주기 호출한다.

| 관심사 | 소유 |
|--------|------|
| 실행 주기 | **외부 cron** (앱 밖) |
| 인스턴스 간 상호배제 | `qp_batch_locks` DB 리스 락 |
| 반복 실패 노출 | `GET /api/health` → 503 |

```
   host cron  ──▶  POST /api/batch/mass-mail
   (3분 주기)      Authorization: Bearer <BATCH_API_TOKEN>
                          │
                  ┌───────┴───────┐
                  ▼               ▼
            app-1 (5000)    app-2 (5001)
                  └───────┬───────┘
                          ▼
                  qp_batch_locks  ← 한 시점에 하나만 실행되도록 원자적 UPDATE
```

### 1.1 환경별 접속 정보

| 항목 | 개발서버 | 운영 |
|------|----------|------|
| 공개 도메인 | `dev.q-partners.q-cells.jp` | `prod.q-partners.q-cells.jp` |
| **배치 호출 URL (호스트 내부, 권장)** | `http://localhost:5010/api/batch/mass-mail` | `http://localhost:5000/api/batch/mass-mail` |
| 배치 호출 URL (공개) | `https://dev.q-partners.q-cells.jp/api/batch/mass-mail` | `https://prod.q-partners.q-cells.jp/api/batch/mass-mail` |
| 컨테이너 | `qpartners-app` | `qpartners-app-1`, `qpartners-app-2` |
| 포트 | 5010 | 5000, 5001 |
| Git 브랜치 | `development` | `main` |
| Jenkinsfile | `Jenkinsfile` | `Jenkinsfile-prod` |
| compose 파일 | `docker-compose.yml` | `docker-compose-production.yml` |
| compose 프로젝트 | (기본값 — `-p` 미지정) | `qpartners-prod` |
| env Credentials ID | `dev-env` → `.env.development` | `prod-env` → `.env.production` |
| `APP_ROOT` | `/home/interplug/qpartners/development` | `/home/interplug/qpartners/production` |
| API 문서 (`/api-docs`) | 사용 가능 | **비활성** (`APP_ENV=development` 에서만 노출) |

> 운영은 `network_mode: host` + 컨테이너 2개이므로 **호스트 내부 URL(`localhost:5000`) 고정 호출을 권장**한다.
> 공개 도메인으로 호출하면 LB 가 어느 인스턴스로 보낼지 알 수 없는데, 그래도 DB 락이 중복을 막으므로 동작에는 문제가 없다.
> 다만 고정 호출이 더 단순하고 장애 추적이 쉽다.
>
> 운영 도메인은 `.env.production` 의 `SITE_URL` 과 일치해야 한다 (`src/lib/config.ts:269` 주석 참조).
> 도메인이 변경되면 이 표와 cron 설정을 함께 갱신할 것.

compose 명령을 직접 실행할 때는 운영에서 `-p` 를 반드시 붙인다 (생략하면 다른 프로젝트로 인식된다).

```bash
docker compose -f docker-compose-production.yml -p qpartners-prod ps
```

---

## 2. 배포에 필요한 3가지

이 배치를 동작시키려면 아래 셋이 **모두** 필요하다. 하나라도 빠지면 대량메일이 발송되지 않는다.

| # | 항목 | 빠졌을 때 증상 |
|---|------|----------------|
| 1 | `qp_batch_locks` 테이블 (마이그레이션) | 배치 호출이 **500** — `Table doesn't exist` |
| 2 | `BATCH_API_TOKEN` 환경변수 | 배치 호출이 **500** — 설정 에러 |
| 3 | cron 등록 | **아무 에러도 안 남** — 조용히 미발송 (가장 위험) |

> ⚠️ **3번은 앱이 감지할 수 없다.** 서버는 정상 기동하고 `/api/health` 도 200 을 반환하지만
> 대량메일만 계속 쌓인다. 이전에는 타이머 등록 실패 시 기동 자체가 실패해서 즉시 알 수 있었는데,
> 그 안전망이 없어졌다.

---

## 3. 배포 절차

### 3.1 마이그레이션 적용 (앱 배포 **전**)

`qp_batch_locks` 테이블을 만든다. 마이그레이션 파일:
`prisma/migrations/20260804060000_add_batch_lock/migration.sql`

> **이 프로젝트는 파이프라인에 `prisma migrate` 단계가 없다** (Jenkinsfile/Dockerfile/compose 모두).
> 런타임 이미지는 `.next/standalone` 만 담고 있어 컨테이너 안에 Prisma CLI 자체가 없다.
> 따라서 **수동 적용**이며, 반드시 앱 배포보다 먼저 해야 한다.

리포지토리를 체크아웃한 별도 위치에서 실행한다.

```bash
git clone https://github.com/nalpari/qpartners-neo.git && cd qpartners-neo
pnpm install --frozen-lockfile

# 대상 DB 를 가리키는 DATABASE_URL 이 담긴 .env 준비 후
pnpm prisma migrate status     # ① 항상 먼저 확인
pnpm prisma migrate deploy     # ② 미적용 마이그레이션만 적용 (reset 없음)
pnpm prisma migrate status     # ③ up to date 확인
```

`migrate dev` 는 **운영에서 사용 금지** — drift 감지 시 DB 리셋을 제안한다. `migrate deploy` 만 쓴다.

적용 확인:

```sql
DESCRIBE qp_batch_locks;
-- name varchar(64) PK / expires_at datetime(3) / holder varchar(191) / updated_at datetime(3)
```

<details>
<summary><b>①에서 이력 불일치(drift)가 나올 경우</b></summary>

```
The migration from the database are not found locally in prisma/migrations:
20260804012149_add_mass_mail_lease_lock
```

DB 에 기록만 있고 로컬에 파일이 없는 상태다. 이 이름(`add_mass_mail_lease_lock`)은
개발 과정에서 생긴 **유령 레코드**로, 실제로는 아무것도 적용되지 않았다. 반드시 먼저 확인한다.

```sql
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10;
```

- `applied_steps_count = 0` → 적용된 것이 없다. 해당 행을 삭제하면 이력이 정상화된다.
  ```sql
  DELETE FROM _prisma_migrations
  WHERE migration_name = '20260804012149_add_mass_mail_lease_lock'
    AND applied_steps_count = 0;
  ```
- `applied_steps_count > 0` → 스키마가 이미 변경된 상태다. **행을 지우지 말고**
  `prisma migrate resolve --applied <이름>` 으로 정합을 맞춘다.

이 레코드를 남겨두면 `migrate deploy` 가 이력 불일치로 실패한다.
</details>

### 3.2 `BATCH_API_TOKEN` 세팅

토큰 생성:

```bash
openssl rand -hex 32
```

환경변수 파일은 git 에 없고 **Jenkins Credentials(file 타입)** 에 등록되어 있다.
파이프라인이 빌드 때마다 복사해 넣는다.

```groovy
// Jenkinsfile-prod:45-48
sh "rm -f .env.${APP_ENV}"
withCredentials([file(credentialsId: "${ENV_CREDENTIALS}", variable: 'ENV_FILE')]) {
    sh "cp \$ENV_FILE .env.${APP_ENV}"
}
```

| 환경 | Credentials ID | 파일 |
|------|----------------|------|
| 운영 | `prod-env` | `.env.production` |
| 개발서버 | `dev-env` | `.env.development` |
| 로컬 | — | 프로젝트 루트 `.env` |

해당 Credentials 파일을 내려받아 아래 한 줄을 추가하고 다시 업로드한다.

```
BATCH_API_TOKEN=9f2c8a1e4b7d0356fa9e2c1b8d47063fe5a1c9b2d8407e63fa15c8b29d4076e3
```

> **따옴표 없이 넣을 것.** `docker compose` 의 `env_file` 은 값을 거의 그대로 넘기는데,
> `getBatchApiToken()`(`src/lib/config.ts:364`)은 `.trim()` 만 하고 따옴표를 벗기지 않는다.
> `BATCH_API_TOKEN="9f2c..."` 로 넣으면 따옴표가 토큰의 일부가 되어 **원인 찾기 어려운 401** 이 난다.

운영 컨테이너 2개는 `.env.production` **하나를 공유**하므로 토큰도 동일하다.
(토큰은 호출자를 인증하는 값이므로 인스턴스별로 다를 필요가 없다.)

### 3.3 앱 배포

Jenkins Job 실행. 이 배치 변경에 한해 파이프라인 수정은 필요 없다.

### 3.4 cron 등록

`network_mode: host` 라서 호스트 cron 이 컨테이너를 직접 호출할 수 있다.
**한 인스턴스만 고정 호출하는 것을 권장한다** — 애초에 겹칠 일이 없고, DB 락은 잔여 경우만 막는다.

```cron
BATCH_API_TOKEN=여기에_토큰
*/3 * * * * curl -sS -m 30 -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5000/api/batch/mass-mail -H "Authorization: Bearer $BATCH_API_TOKEN" >> /var/log/mass-mail-batch.log 2>&1
```

- **주기 3분** — 기존 앱 내부 타이머와 동일
- `-m 30` — 엔드포인트는 즉시 202 를 반환하고 발송은 백그라운드에서 진행되므로 짧아도 된다
- cron 파일은 토큰이 평문이므로 `chmod 600` + root 소유
- 개발서버는 포트 `5010`

### 3.5 순서 요약

```
① 마이그레이션 적용 (§3.1)        → 확인: DESCRIBE qp_batch_locks
② BATCH_API_TOKEN Credentials     → 확인: §4 길이 검증
③ 앱 배포 (Jenkins)               → 확인: /api/health 200
④ cron 등록 (§3.4)                → 확인: 로그에 202 기록
```

①을 건너뛰고 ③을 하면 배치 호출이 500 으로 실패한다.

---

## 4. 배포 후 검증

```bash
# 1) 토큰 주입 확인 (값 노출 없이 길이만)
docker exec qpartners-app-1 sh -c 'echo ${#BATCH_API_TOKEN}'   # 64 여야 함
docker exec qpartners-app-2 sh -c 'echo ${#BATCH_API_TOKEN}'

# 2) 인증 거부 확인
curl -s -w " [%{http_code}]\n" -X POST http://localhost:5000/api/batch/mass-mail
# → {"error":"認証が必要です"} [401]

# 3) 정상 호출
curl -s -w " [%{http_code}]\n" -X POST http://localhost:5000/api/batch/mass-mail \
  -H "Authorization: Bearer $BATCH_API_TOKEN"
# → {"started":true,"skipped":false} [202]

# 4) cycle 로그
docker logs qpartners-app-1 2>&1 | grep -E "batch|auto-retry-batch" | tail -20

# 5) readiness
curl -s http://localhost:5000/api/health
# → {"ready":true,"checks":{"massMailBatch":true}}
```

정상이면 로그에 이런 흐름이 남는다.

```
[POST /api/batch/mass-mail] cycle 시작 (holder=<host>:<pid>:<uuid8>, lease=300000ms)
[mass-mail/auto-retry-batch] cycle 시작 — 대상 N건
[mass-mail/auto-retry-batch] cycle 완료 — 처리: N/N건, 소요: ...ms
```

처리 대상이 없으면 `처리 대상 없음 — cycle 종료` 로 끝난다 (정상).

체크리스트:

- [ ] `DESCRIBE qp_batch_locks` 성공
- [ ] 두 컨테이너 모두 토큰 길이 정상
- [ ] 토큰 없이 호출 → 401
- [ ] 정상 호출 → 202
- [ ] `/api/health` → 200
- [ ] cron 로그에 202 기록 (3분 후)

---

## 5. 응답 해석 (알람 설정 기준)

| 응답 | 의미 | 알람 |
|------|------|------|
| `202` `{"started":true,"skipped":false}` | 실행 시작 | — |
| `200` `{"started":false,"skipped":true,"reason":"locked"}` | 다른 인스턴스/앞선 호출이 실행 중 — **정상** | — |
| `401` `{"error":"認証が必要です"}` | 토큰 누락·불일치 (따옴표 의심) | **필요** |
| `500` `{"error":"サーバーエラーが発生しました"}` | `BATCH_API_TOKEN` 미설정, 락 획득 중 DB 오류 등 | **필요** |

> 알람은 **4xx/5xx 에만** 설정한다. `200`(skipped)은 정상 동작이므로 알람을 걸면 노이즈가 된다.
>
> cycle 은 백그라운드에서 진행되므로 **처리 결과는 응답에 담기지 않는다.**
> 발송 성패는 서버 로그, 반복 실패는 `/api/health` 로 확인한다.

---

## 6. 운영

### 6.1 모니터링

| 대상 | 방법 | 이상 신호 |
|------|------|-----------|
| **배치 호출 자체** | cron 로그 (`/var/log/mass-mail-batch.log`) | **기록이 끊김** |
| cycle 반복 실패 | `GET /api/health` | `503` = 5회 연속 실패 |
| 발송 적체 | 아래 SQL | `pending` 이 계속 증가 |
| 락 상태 | 아래 SQL | 계속 `보유중` |

> `/api/health` 는 **배치가 호출되지 않는 상황을 감지하지 못한다.** cron 로그 감시가 별도로 필요하다.

```sql
-- 대량메일 상태 분포
SELECT status, COUNT(*) FROM qp_mass_mails GROUP BY status;

-- 발송 대기 적체 (계속 증가하면 배치 미동작 의심)
SELECT COUNT(*) FROM qp_mass_mail_recipients WHERE status = 'pending';

-- 락 상태
SELECT name, holder, expires_at, NOW(3) AS db_now,
       IF(expires_at <= NOW(3), '해제', '보유중') AS state
FROM qp_batch_locks;
```

### 6.2 로그

```bash
# 배치
docker logs qpartners-app-1 2>&1 | grep -E "batch|auto-retry-batch"

# 심각 이벤트
docker logs qpartners-app-1 2>&1 | grep CRITICAL
```

prefix: `[POST /api/batch/mass-mail]`, `[mass-mail/auto-retry-batch]`, `[mass-mail/send-processor]`, `[batch-lock]`.
로그 메시지는 한국어, 유저 대면 메시지는 일본어.

### 6.3 장애 대응

| 증상 | 원인 | 조치 |
|------|------|------|
| 호출이 `500`, 로그에 `Table 'qp_batch_locks' doesn't exist` | 마이그레이션 미적용 | [§3.1](#31-마이그레이션-적용-앱-배포-전) |
| 호출이 `500`, 로그에 `BATCH_API_TOKEN 환경변수가 필수입니다` | 토큰 미설정 | [§3.2](#32-batch_api_token-세팅) 후 재배포 |
| 호출이 `401` | 토큰 불일치 — 따옴표 혼입 의심 | `docker exec ... echo ${#BATCH_API_TOKEN}` 로 길이 확인 |
| 메일 미발송, cron 로그 **없음** | cron 미등록/중단 | [§3.4](#34-cron-등록) |
| 메일 미발송, cron 로그 202 정상 | 발송 로직 문제 | `grep auto-retry-batch` / `grep send-processor` 로 cycle 확인 |
| 항상 `200 locked` | 리스가 해제되지 않음 | [§6.1](#61-모니터링) SQL 확인. 홀더 프로세스가 죽었어도 리스 만료(기본 5분)로 자동 회수된다 |
| `/api/health` 503 | cycle 5회 연속 실패 | `grep CRITICAL` 로 원인 확인. **정상 cycle 1회로 자동 리셋**되므로 원인 해소 후 재기동 불필요 |
| 로그에 `CRITICAL — 리스 갱신 실패(소유권 상실)` | 리스가 만료돼 다른 인스턴스가 이어받음 | 중복 실행 가능성 있음. cycle 이 리스보다 오래 걸렸는지 확인 → `MASS_MAIL_BATCH_LEASE_MS` 상향 검토 |

### 6.4 튜닝 환경변수

모두 선택 사항이며 미설정 시 기본값으로 동작한다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MASS_MAIL_BATCH_LEASE_MS` | 300000 (5분) | 분산 락 리스. 실행 중 `리스/3` 주기로 자동 갱신되므로 cycle 이 더 길어도 안전. 홀더 프로세스가 죽었을 때 다른 인스턴스가 이어받기까지의 **최대 대기 시간** |
| `MASS_MAIL_THROTTLE_MS` | 200 | 건별 발송 간격 (SMTP rate limit / IP 블랙리스트 방지) |
| `MASS_MAIL_ZOMBIE_THRESHOLD_MS` | 600000 (10분) | `sending` 이 이 시간 넘게 정체되면 `send_failed` 자동 승격 |
| `MASS_MAIL_RECIPIENT_MAX_RETRY` | 3 | 수신자별 재시도 상한 |
| `MASS_MAIL_RECIPIENT_RETRY_DELAY_MS` | 30000 | 수신자별 재시도 간격 |

> **`MASS_MAIL_BATCH_INTERVAL_MS` 는 제거되었다.** 실행 주기는 cron 이 소유한다.
> 기존 env 파일에 남아 있으면 무시되므로, 혼동을 줄이기 위해 삭제할 것.

---

## 7. 중복 실행 방어 구조

`qp_batch_locks` 행에 대한 원자적 UPDATE 로 인스턴스 간 상호배제를 보장한다.
구현: `src/lib/mass-mail/batch-lock.ts`

락은 2종이며, 획득 순서가 항상 cycle → mail 이라 교착이 없다.

| 락 | 이름 | 획득 주체 | 막는 경합 |
|----|------|-----------|-----------|
| cycle 락 | `mass-mail` | `POST /api/batch/mass-mail` | 배치 cycle 끼리 |
| mail 락 | `mass-mail:{id}` | `runWithMassMailLock` (배치·수동 공통) | 배치 ↔ 관리자 [発送]/[再送信] |

mail 락이 별도로 필요한 이유: 관리자 발송 경로는 배치가 아니라 cycle 락을 잡지 않는데,
발송 중(`status='sending'`)인 메일도 배치의 처리 대상(pending/sending)에 포함된다.
mail 락이 없으면 "A 의 수동 발송"과 "B 의 배치"가 같은 pending 수신자에게 이중 발송한다.

좀비 감지도 mail 락 보유 여부로 in-flight 를 판정하므로,
다른 인스턴스에서 발송 중인 건을 `send_failed` 로 오판정하지 않는다.

두 락 모두 아래 리스 모델을 공유한다.

| 동작 | 방식 |
|------|------|
| 획득 | `UPDATE ... WHERE name=? AND expires_at <= NOW` — 단일 원자적 UPDATE 이므로 동시 시도 시 성공은 한쪽뿐. 행이 없으면 `create`, PK 충돌은 "보유 중"으로 간주 |
| 갱신 | `리스/3` 주기로 만료 시각을 밀어 유지 (긴 cycle 대응) |
| 해제 | 종료 시 `expires_at = NOW` → 다음 호출이 즉시 획득 가능 |
| 크래시 | 해제가 실행되지 않지만 리스 만료로 자동 회수 — **영구 데드락 없음** |

홀더 식별자는 `hostname:pid:uuid8` 로 **실행 1회당 유일**하다.
리스를 잃은 직전 실행의 갱신 타이머가 새 홀더의 락을 되살리지 못하게 하기 위함이다.

### 로컬 검증 결과 (2026-08-04)

프로덕션 빌드로 standalone 서버 2개(3000/3001)를 같은 DB 에 붙여 운영 구성을 재현해 검증했다.

| 검증 항목 | 결과 |
|-----------|------|
| 두 인스턴스에 동시 6건 호출 | **202 정확히 1건**, 나머지 5건 `200 locked` |
| SMTP 발송 건수 (2회 테스트, 8+6건) | **정확히 14건** — 락을 얻지 못한 인스턴스는 `sendLoop` 0회, 중복 발송 없음 |
| 전체 경로 | `sending` → 발송 → `sent` 승격, `sent_success` 정합 |
| 리스 자동 갱신 (리스 60초로 낮춤) | `t+20s`(= 리스/3) 시점에 만료 시각 전진 확인, cycle 종료 후 즉시 해제 |
| 락 획득 실패 시 | 기존 `holder` 값 미변경 |

---

## 8. 알려진 제약

| 항목 | 내용 |
|------|------|
| **호출 누락 감지 불가** | 앱은 "cron 이 호출하지 않는 상태"를 알 수 없다. `/api/health` 는 계속 200 을 반환하므로 cron 측 감시가 필수 |
| **마이그레이션 자동화 부재** | 파이프라인에 `prisma migrate` 단계가 없어 수동 적용. 이 프로젝트 전반의 제약이며 자동화가 개선 후보 |
| 락 행 누적 | mail 락은 `mass_mail` 1건당 `qp_batch_locks` 행 1개를 남기고 삭제하지 않는다 (해제는 `expires_at` 되돌리기). 행 수가 mass_mail 건수와 같아 실무상 무해하나, 정리가 필요해지면 만료된 지 오래된 `mass-mail:%` 행 삭제 배치를 추가 |
| 결과가 응답에 없음 | 202 즉시 반환 + 백그라운드 실행이므로 스케줄러는 발송 성패를 알 수 없다. 로그·health 로 확인 |
| `maybePromoteToSent` 로그 문구 | 차단 사유가 `sentTotal=0` 인데도 `"pending/sending 아님 (현재 status=pending)"` 이라고 출력해 자기 모순이다 (기존 코드). 장애 조사 시 오독 주의 |

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| [02-design/features/mass-mail-send.design.md §4.6](./02-design/features/mass-mail-send.design.md) | 배치 설계 상세 (락 모델, 동작 흐름, 버전 이력) |
| [ci-cd-pipeline.md](./ci-cd-pipeline.md) | 파이프라인 구성 전반, 이미지 태깅·롤백 |
| [development-guide.md](./development-guide.md) | 로컬 개발 환경, Prisma 스키마 관리 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-08-04 | 초판 — setInterval → 외부 스케줄러 전환에 따른 배포·운영 가이드 | CK |
