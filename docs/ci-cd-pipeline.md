# CI/CD 파이프라인

QPartners Neo의 CI/CD는 **Jenkins**를 오케스트레이터로 사용하며, **Docker 멀티스테이지 빌드 + Docker Compose** 기반으로 컨테이너를 배포한다. 개발(`development`)과 운영(`main`) 브랜치가 각각 독립된 Jenkinsfile로 분리되어 있고, 운영은 2 인스턴스 동시 운영 구조다.

---

## 1. 전체 구조

```
┌──────────────────────────────────────────────────────────────────┐
│ GitHub: nalpari/qpartners-neo                                    │
│   ├─ development branch  ──►  Jenkins (dev pipeline, SCM polling)│
│   └─ main branch         ──►  Jenkins (prod pipeline, manual)    │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────┐
        │ Jenkins Pipeline                                │
        │   Checkout → Prepare Env → Docker Build →       │
        │   Stop Existing → Deploy → Health Check         │
        └─────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────┐
        │ Docker Compose                                  │
        │   dev  : docker-compose.yml            (1 컨테이너) │
        │   prod : docker-compose-production.yml (2 컨테이너) │
        └─────────────────────────────────────────────────┘
```

---

## 2. 관련 파일

| 파일 | 역할 |
|------|------|
| `Jenkinsfile` | development 브랜치 자동 배포 파이프라인 |
| `Jenkinsfile-prod` | main 브랜치 운영 배포 파이프라인 (수동 트리거) |
| `Dockerfile` | Next.js standalone 산출물 멀티스테이지 빌드 |
| `docker-compose.yml` | dev 환경 컴포즈 (단일 컨테이너, host network) |
| `docker-compose-production.yml` | prod 환경 컴포즈 (`app-1`, `app-2` 2 인스턴스) |
| `.dockerignore` | `node_modules`, `.next`, `.git`, `.env*`, `docker-compose.yml` 제외 |
| `ecosystem.config.js` | PM2 설정 (현재 CI/CD에서는 미사용, 대체 런타임용) |

---

## 3. Jenkins 파이프라인

### 3.1 공통 옵션

| 옵션 | 값 |
|------|----|
| `timestamps()` | 로그 라인별 타임스탬프 |
| `timeout` | 30분 |
| `disableConcurrentBuilds()` | 동시 빌드 차단 (배포 충돌 방지) |
| `buildDiscarder` | 최근 10개 빌드 이력만 유지 |

### 3.2 Development 파이프라인 (`Jenkinsfile`)

| 항목 | 값 |
|------|----|
| 브랜치 | `development` |
| APP_ENV | `development` |
| APP_PORT | `5010` |
| APP_ROOT | `/home/interplug/qpartners/development` |
| Compose 파일 | `docker-compose.yml` |
| 이미지 태그 | `qpartners-neo:${BUILD_NUMBER}` + `qpartners-neo:latest` |
| 트리거 | `pollSCM('0 8,12,17 * * *')` — 매일 08/12/17시 SCM 폴링 후 새 커밋 있을 때만 빌드 |
| Credentials | `github-app-credential`, `dev-env` |

### 3.3 Production 파이프라인 (`Jenkinsfile-prod`)

| 항목 | 값 |
|------|----|
| 브랜치 | `main` |
| APP_ENV | `production` |
| APP_ROOT | `/home/interplug/qpartners/production` |
| Compose 파일 | `docker-compose-production.yml` |
| Compose 프로젝트명 | `qpartners-prod` (`-p` 플래그로 dev와 격리) |
| 이미지 태그 | `qpartners-neo:release-${BUILD_NUMBER}` + `qpartners-neo:release-latest` |
| 트리거 | **수동 실행** (자동 트리거 없음) |
| Credentials | `github-app-credential`, `prod-env` |
| 인스턴스 | `qpartners-app-1` (포트 5000), `qpartners-app-2` (포트 5001) |

> 운영은 자동 트리거가 의도적으로 빠져 있다. 릴리스 시점은 사람이 통제한다.

### 3.4 Stage별 동작

#### Checkout
- 지정 브랜치에서 `git checkout`
- `git rev-parse --short HEAD`로 짧은 커밋 해시를 `GIT_COMMIT_SHORT`에 저장 → 빌드 로그 추적용

#### Prepare Env
- 이전 빌드에서 남은 `.env.${APP_ENV}` 제거 (root 소유 파일이 남는 경우 대비)
- Jenkins Credentials(`dev-env` 또는 `prod-env`, type: file)에서 `.env.${APP_ENV}` 복사
- `.env` 파일은 리포지토리에 커밋되지 않으며 **전적으로 Jenkins 자격증명에서 주입**됨

#### Docker Build
- dev: `qpartners-neo:${BUILD_NUMBER}` + `qpartners-neo:latest` 동시 태깅, `--build-arg PORT=${APP_PORT}` 전달
- prod: `qpartners-neo:release-${BUILD_NUMBER}` + `qpartners-neo:release-latest`
- `Dockerfile`이 멀티스테이지(base → deps → builder → runner)로 구성되어 있고, `.next/cache` BuildKit cache mount로 증분 빌드 단축

#### Stop Existing
- `docker compose down --remove-orphans` (실패해도 `|| true`로 진행)
- prod는 `-p qpartners-prod` 프로젝트명으로 격리

#### Deploy
- `docker compose up -d`로 신규 이미지 기반 컨테이너 기동
- `IMAGE_TAG`, `APP_PORT`, `APP_ENV`, `APP_ROOT` 환경변수를 컴포즈에 주입

#### Health Check
- dev: 10초 대기 후 `docker compose ps`로 컨테이너 상태 확인
- prod: 10초 대기 후, `docker exec`로 컨테이너 내부에서 `http://localhost:5000/` / `http://localhost:5001/`을 5초 타임아웃·6회 재시도(간격 5초)로 호출. **`host network` 모드라 Jenkins 에이전트에서 직접 localhost 접근이 불가하기 때문**.
- 한 인스턴스라도 헬스체크 실패 시 `exit 1` → 빌드 실패 처리

### 3.5 post 블록

| 조건 | 동작 |
|------|------|
| `success` | 성공 로그(빌드 번호 + 커밋 해시) 출력, 오래된 이미지 정리(최근 3개 태그만 유지) |
| `failure` | 실패 로그 출력, `docker compose logs --tail=100`로 컨테이너 로그 수집 |
| `always` | `docker image prune -f` (prod는 추가로 `.env.${APP_ENV}` 삭제) |

---

## 4. Dockerfile (멀티스테이지)

```
base    : node:22-alpine + corepack(pnpm) 활성화
  ↓
deps    : pnpm install --frozen-lockfile (package.json, pnpm-lock.yaml, prisma/)
  ↓
builder : NODE_OPTIONS=--max-old-space-size=4096
          BuildKit cache mount(/app/.next/cache) → 증분 빌드
          npx prisma generate && npx next build (Turbopack)
  ↓
runner  : node:22-alpine
          NODE_ENV=production
          비특권 사용자 nextjs(1001) / nodejs(1001) 생성 후 USER 전환
          /app/public, /app/.next/standalone, /app/.next/static만 복사
          CMD ["node", "server.js"]  ← Next.js standalone 산출물
```

핵심 포인트:
- **standalone output** (`next.config.ts`) 활용으로 런타임 이미지에는 `node_modules` 전체가 아니라 필요한 의존성만 포함
- **`PORT` ARG**를 빌드 타임에 받아 `ENV PORT`로 노출 → 컴포즈에서 인스턴스별 포트 주입
- **`HOSTNAME=0.0.0.0`** 로 컨테이너 외부 노출 보장

---

## 5. Docker Compose

### 5.1 `docker-compose.yml` (개발)

- 단일 서비스 `app`, 이미지 `qpartners-neo:${IMAGE_TAG:-latest}`
- `network_mode: host` — 호스트 네트워크 직접 사용 (포트 매핑 불필요)
- `env_file: .env.${APP_ENV:-development}` — Jenkins가 주입한 .env 파일 로드
- 업로드 볼륨: `${APP_ROOT}/uploads_data:/data/uploads`
- 빌드 인자: `PORT: ${APP_PORT:-5010}`

### 5.2 `docker-compose-production.yml` (운영)

- 두 서비스 `app-1`, `app-2` — 동일 이미지(`release-${IMAGE_TAG}`)에 PORT만 다르게 주입(5000/5001)
- 동일한 `.env.production` 파일을 공유
- 업로드 볼륨도 **공유** (`${APP_ROOT}/uploads_data:/data/uploads`) — 두 인스턴스가 같은 파일 시스템에 접근
- `network_mode: host` — 외부 로드밸런서(Nginx 등 추정)가 5000/5001을 부하 분산
- `restart: unless-stopped`로 컨테이너 비정상 종료 시 자동 재시작

---

## 6. 이미지 태깅 & 롤백 전략

### 태깅 규칙

| 환경 | 태그 형식 | 예시 |
|------|-----------|------|
| dev | `${BUILD_NUMBER}`, `latest` | `qpartners-neo:42`, `qpartners-neo:latest` |
| prod | `release-${BUILD_NUMBER}`, `release-latest` | `qpartners-neo:release-42`, `qpartners-neo:release-latest` |

### 이미지 보관 정책 (`post.success`)

- dev: `latest` 제외하고 숫자 태그 정렬 후 최근 3개만 유지, 나머지는 `docker rmi`
- prod: `release-latest` 제외하고 `release-*` 태그 정렬 후 최근 3개만 유지
- 매 빌드 종료 시 `docker image prune -f`로 dangling 이미지 정리

### 롤백 절차

```bash
# 예: dev에서 빌드 42 → 41로 롤백
IMAGE_TAG=41 APP_PORT=5010 APP_ENV=development \
  APP_ROOT=/home/interplug/qpartners/development \
  docker compose -f docker-compose.yml up -d

# prod에서 release-42 → release-41로 롤백
IMAGE_TAG=41 APP_ENV=production \
  APP_ROOT=/home/interplug/qpartners/production \
  docker compose -f docker-compose-production.yml -p qpartners-prod up -d
```

이미지 보관 정책상 **최근 3개 빌드까지만 롤백 가능**하다. 더 오래된 버전이 필요하면 해당 커밋에서 Jenkins를 재빌드해야 한다.

---

## 7. Credentials & 비밀 관리

| Jenkins Credential ID | Type | 용도 |
|-----------------------|------|------|
| `github-app-credential` | Username/Password 또는 SSH Key | GitHub 리포지토리 체크아웃 |
| `dev-env` | Secret file | `.env.development` 파일 (DB 접속정보, JWT_SECRET, SMTP, AES 키 등) |
| `prod-env` | Secret file | `.env.production` 파일 (운영 키 일체) |

- `.env*` 파일은 `.gitignore` + `.dockerignore`에 모두 포함되어 있어 리포지토리·이미지에 절대 포함되지 않음
- 운영 키(JWT_SECRET, OTP_SECRET, AUTO_LOGIN_AES_KEY, HANASYS/Q_ORDER/Q_MUSUBI URL 등)는 **모두 Jenkins credential `prod-env`로만 주입**
- `prod` 파이프라인은 `post.always`에서 빌드 후 `.env.production`을 삭제하여 워크스페이스에 잔류하지 않도록 처리

---

## 8. 환경변수 흐름

```
┌────────────────────────────────────────────────────────────────┐
│ Jenkins Credentials (dev-env / prod-env)                       │
│   .env.development / .env.production                           │
└────────────────────────────────────────────────────────────────┘
                       │ (Prepare Env stage가 복사)
                       ▼
┌────────────────────────────────────────────────────────────────┐
│ Workspace: ./.env.${APP_ENV}                                   │
└────────────────────────────────────────────────────────────────┘
                       │ (docker compose의 env_file 지시자)
                       ▼
┌────────────────────────────────────────────────────────────────┐
│ Container ENV:                                                 │
│   DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME → src/lib/prisma │
│   JWT_SECRET, OTP_SECRET, SMTP_*, QSP_BASE_URL                 │
│   AUTO_LOGIN_AES_KEY, HANASYS/Q_ORDER/Q_MUSUBI URL             │
│   APP_ENV, PORT, UPLOAD_DIR=/data/uploads                      │
└────────────────────────────────────────────────────────────────┘
```

> `DATABASE_URL`은 Prisma CLI(migration, generate)에서만 사용되고, 런타임에서는 개별 `DB_*` 변수가 `@prisma/adapter-mariadb`에 주입된다. 자세한 내용은 `.claude/rules/prisma.md` 참조.

---

## 9. 주의사항 & 운영 노트

### 동시 빌드 차단
- `disableConcurrentBuilds()` 옵션으로 같은 Job이 동시에 두 번 돌지 않음 → 컨테이너 down/up 충돌 방지
- dev와 prod는 별도 Job이므로 동시에 돌 수 있다

### Compose 프로젝트 격리
- prod에서 `-p qpartners-prod`를 지정하지 않으면 같은 호스트의 dev 컨테이너와 컨테이너 이름이 충돌할 수 있음
- dev 컴포즈는 `container_name: qpartners-app`, prod는 `qpartners-app-1`/`qpartners-app-2`로 이름이 달라 실제로는 충돌하지 않지만, 격리 의도가 명시되어 있음

### Health Check의 한계
- dev는 `docker compose ps`만 확인 → 컨테이너가 떠 있다는 것만 보장하고 HTTP 응답은 검증하지 않음
- prod는 `node` 런타임으로 컨테이너 내부에서 `http://localhost:PORT/` 호출 → 실제 응답까지 검증 (5초 타임아웃 × 6회 재시도 = 최대 30초)
- 헬스체크 엔드포인트가 별도로 존재하지 않고 루트 페이지(`/`)의 4xx 미만 응답을 기준으로 함

### 업로드 파일 영속성
- 컨테이너 재배포 시 `${APP_ROOT}/uploads_data` 호스트 디렉터리에 마운트되므로 업로드 데이터는 보존됨
- prod 2 인스턴스가 **동일 볼륨을 공유**하므로 어느 인스턴스가 처리해도 파일 일관성 유지

### 캐시 동작
- BuildKit cache mount(`/app/.next/cache`)는 Jenkins agent의 Docker 빌드 캐시에 보존됨 → 동일 agent에서 재빌드 시 빠름
- agent를 옮기거나 캐시 자체가 prune되면 풀빌드 시간 소요

---

## 10. 향후 개선 후보 (참고용)

현재 구성에서 빠져 있는 항목들 — 필요 시 추가 검토 대상:

- **빌드 전 정적 검증 stage 부재**: Jenkins 파이프라인에 `pnpm lint`, `tsc --noEmit`, 테스트 실행이 없음. 현재는 PR 단계나 개발자 로컬에서 보장. (`CLAUDE.md` 메모: task 종료 시 서브 에이전트로 lint/type/build 체크)
- **Container HEALTHCHECK 미정의**: Dockerfile에 `HEALTHCHECK` 지시자가 없음 → 컴포즈 `depends_on: service_healthy` 사용 불가. 헬스체크는 Jenkins stage에서만 수행됨
- **이미지 레지스트리 미사용**: 빌드된 이미지가 로컬 Docker 데몬에만 존재. 다중 호스트 배포 시 레지스트리(GHCR/ECR/Harbor) 도입 필요
- **자동 롤백 미구현**: 헬스체크 실패 시 단순히 `failure` 처리하고 로그만 남길 뿐, 자동으로 이전 `IMAGE_TAG`으로 되돌리지 않음. 운영자가 수동 롤백 명령 실행 필요
- **Production 자동 트리거 부재**: 의도적으로 수동만 허용. 자동화하려면 `release-*` 태그 푸시 트리거 등 도입 검토
