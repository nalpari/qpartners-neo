/**
 * 애플리케이션 설정 (push 대상)
 *
 * - API 엔드포인트 경로는 코드에서 관리
 * - base URL / 비밀값은 환경변수(.env)에서 주입
 */

import { join, resolve } from "path";

// ─── QSP External API ───
// NOTE: Node.js runtime 전용 — Edge Runtime에서는 함수 내부에서 env를 읽어야 함

const rawQspBaseUrl = process.env.QSP_BASE_URL?.trim();
const rawQspEncryptBaseUrl = process.env.QSP_ENCRYPT_BASE_URL?.trim();
// next build는 NODE_ENV=production 으로 각 route를 로드하여 page data를 수집한다.
// 빌드 시점엔 운영 env가 주입되지 않는 것이 정상이므로, 검증은 런타임에만 수행한다.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
// 검증 기준은 Next.js 런타임 모드(NODE_ENV)가 아닌 **배포 환경**(APP_ENV) 이다.
// Jenkinsfile / docker-compose 에서 APP_ENV 로 환경을 구분 (development | production).
// dev 배포는 APP_ENV=development 로 HTTPS 강제 우회 가능 (QSP dev 엔드포인트가 http 인 경우 대응).
//
// APP_ENV 누락/오타(예: "prod", "develop", undefined) 시 isProductionDeploy=false 로 평가되어
// 운영 전용 검증 블록이 통째로 스킵되는 위험(PR #87 사고의 거울상 — dev URL 이 운영 사용자에게 노출)
// 을 방지하기 위해 fail-closed 로 명시 검증.
const rawAppEnv = process.env.APP_ENV;
// 빌드 시점 우회는 **APP_ENV 누락 케이스만** 허용. APP_ENV 가 명시되어 있으면 빌드 단계에서도
// 값 검증을 수행하여 "prod"/"develop" 같은 오타를 즉시 잡는다.
// 또한 NEXT_PHASE env 가 런타임 컨테이너에 leak 된 경우에도, APP_ENV 가 정상 주입되어 있다면
// 검증을 수행하여 silent skip 을 방지.
const isBuildPhaseSkip =
  isBuildPhase && (rawAppEnv === undefined || rawAppEnv.trim() === "");
if (!isBuildPhaseSkip && rawAppEnv !== "production" && rawAppEnv !== "development") {
  throw new Error(
    `APP_ENV must be explicitly set to "production" or "development" (got: ${rawAppEnv ?? "undefined"})`,
  );
}
const isProductionDeploy = rawAppEnv === "production";

if (isProductionDeploy && !isBuildPhase && !rawQspBaseUrl) {
  throw new Error("QSP_BASE_URL is required in production");
}

const QSP_BASE_URL = rawQspBaseUrl || "https://jp-dev.qsalesplatform.com";

/**
 * autoLoginEncryptData API 전용 base URL (optional).
 * 미지정 시 QSP_BASE_URL 로 fallback — 기존 동작 유지(backward compatible).
 *
 * 용도: QSP 측 사정으로 autoLoginEncryptData 만 별도 인스턴스/도메인 호출이 필요한 경우
 * (예: 내부 IP QSP 인스턴스에는 세션 인증이 걸려 있고 public 도메인에서만 무세션 허용하는 상황).
 * login / userDetail 등 다른 QSP API 는 QSP_BASE_URL 을 계속 사용하므로 영향 없음.
 */
const QSP_ENCRYPT_BASE_URL = rawQspEncryptBaseUrl || QSP_BASE_URL;

if (isProductionDeploy && !QSP_BASE_URL.startsWith("https://")) {
  throw new Error("QSP_BASE_URL must use HTTPS in production");
}
if (isProductionDeploy && !QSP_ENCRYPT_BASE_URL.startsWith("https://")) {
  throw new Error("QSP_ENCRYPT_BASE_URL must use HTTPS in production");
}

export const QSP_API = {
  /** No.3 Q.Partners Login API — Q.Partners 로그인 */
  login: `${QSP_BASE_URL}/api/qpartners/user/login`,
  /** No.6 Q.Partners(일반) 회원가입 — Q.Partners 신규 일반 사용자 신청 */
  newUserReq: `${QSP_BASE_URL}/api/qpartners/user/newUserReq`,
  /** No.13 Q.Partners 유저 정보 조회 — 이메일 또는 ID로 회원정보 조회 */
  userDetail: `${QSP_BASE_URL}/api/qpartners/user/detail`,
  /** No.4,5 Q.Partners Password Change — 비밀번호 변경/초기화 (chgType: C=변경, I=초기화) */
  userPwdChg: `${QSP_BASE_URL}/api/qpartners/user/userPwdChg`,
  /** No.9 Q.Partners 2차인증 일시 갱신 */
  updateSecAuthDt: `${QSP_BASE_URL}/api/qpartners/user/updateSecAuthDt`,
  /** No.7 Q.Partners 회원정보 수정 — 마이페이지 내정보변경 */
  updateUserDtl: `${QSP_BASE_URL}/api/qpartners/user/updateUserDtl`,
  /** No.8 Q.Partners 회원 탈퇴 — Q.Partner(일반사용자) 탈퇴 전용 엔드포인트.
   *  필수: userTp, loginId, accsSiteCd, resignRemark(<=500). updateUserDtl 로 statCd=R 전환은
   *  QSP 가 수용하지 않아 500 반환되므로 본 엔드포인트를 사용해야 함. */
  saveResignReq: `${QSP_BASE_URL}/api/qpartners/user/saveResignReq`,
  /** No.10 Q.Partners 회원관리 목록 조회 */
  userListMng: `${QSP_BASE_URL}/api/qpartners/userMng/userListMng`,
  /** No.12 Q.Partners 회원관리 정보 수정 — 부가 정보 수정 (2차인증, 뉴스레터, 로그인 알림, 뉴스 수신) */
  updateUserDtlMng: `${QSP_BASE_URL}/api/qpartners/userMng/updateUserDtlMng`,
  /** 자동로그인 암호화 — QSP 가 16B cipher 를 발급하여 반환 (3사 공통).
   *  base URL 은 QSP_ENCRYPT_BASE_URL 로 별도 override 가능 (다른 API 와 분리) */
  autoLoginEncrypt: `${QSP_ENCRYPT_BASE_URL}/login/autoLoginEncryptData`,
  /** Q.Partners 부서 목록 조회 — 관리자 콘텐츠 검색 필터 (担当部門) 셀렉트 옵션용 */
  deptList: `${QSP_BASE_URL}/api/master/deptList`,
} as const;

// ─── Auto Login (HANASYS / Q.Order / Q.Musubi) ───
// 3사 모두 QSP `autoLoginEncryptData` API 로부터 동일한 16B cipher 를 받고,
// Q.Partners 가 target 별 URL 에 `?autoLoginParam1=<cipher>` 를 붙여 이동시킨다.
// QSP 응답의 `data.url` 은 HANASYS 한정 힌트이므로 사용하지 않고 아래 map 을 자체 관리.
//
// URL 은 환경별 .env 파일에 명시 주입 (env 필수, 누락 시 부팅 실패).
//   .env.development → dev URL (개발/통테)
//   운영 Jenkins credential → prod URL
//   env: HANASYS_AUTOLOGIN_URL / Q_ORDER_AUTOLOGIN_URL / Q_MUSUBI_AUTOLOGIN_URL
//
// 이전에는 코드에 dev default 를 하드코딩 후 prod 에서만 env override 를 강제했으나,
// (1) 운영 부팅 시 default 잔존 차단 로직이 복잡해지고
// (2) APP_ENV 가 잘못 주입되면 dev 배포에서 default(=dev URL) 가 통과해 운영 URL 로 빠질
//     역방향 리스크가 항상 존재했음. 환경별 분기 정책(feedback_env_per_environment_config.md)
//     에 맞춰 env 필수화로 정리 (2026-04-25 사고 → 2026-05-13 후속 정리).

/**
 * 운영 자동로그인 host 화이트리스트.
 *
 * env 값이 잘못/악의적으로 다른 host 로 주입(`https://attacker.example.com/login`,
 * `https://www.hanasys.jp@attacker.example.com/login` 등 userinfo 트릭)되어도 cipher 가
 * 외부로 유출되지 않도록 prod 부팅 단계에서 host 일치 검증 (open redirect 방어).
 */
const PROD_AUTOLOGIN_HOSTS = {
  hanasys: "www.hanasys.jp",
  qOrder: "q-order.q-cells.jp",
  qMusubi: "q-musubi.q-cells.jp",
} as const;

/**
 * 자동로그인 URL env 해석.
 * - dev/prod 공통: env 누락 시 부팅 실패 (fail-closed).
 *   단, `next build` 의 page data 수집 단계(NEXT_PHASE=phase-production-build)에서는 검증 보류
 *   — 런타임 컨테이너에 env 가 주입되므로 빌드 머신은 placeholder 로 통과시키고, 런타임 평가 시
 *   다시 검증된다.
 * - dev 배포: HTTPS 강제. HTTP 허용은 ALLOW_INSECURE_AUTOLOGIN_URL=true 명시 opt-in.
 *   stdout 모니터링 부재 환경에서 평문 cipher 가 silent 로 흐르지 않도록 fail-closed.
 * - prod 배포: 추가로 assertProdAutoLoginUrl 에서 host 화이트리스트 / userinfo / 포트 검증.
 */
function resolveAutoLoginUrl(envName: string): string {
  const url = process.env[envName]?.trim();
  if (!url) {
    if (isBuildPhase) {
      // 빌드 단계 placeholder — 런타임 컨테이너에서 다시 evaluate 되며 그 시점에 env 가 주입됨.
      // 의도적으로 유효하지 않은 host 를 써서, 만약 placeholder 가 런타임에 새어나가더라도
      // prod host 화이트리스트 검증에서 즉시 차단되도록 한다.
      return "https://placeholder.invalid/build-phase";
    }
    throw new Error(
      `${envName} is required (자동로그인 URL 미설정). .env.development 또는 운영 credential 에 명시하세요.`,
    );
  }
  if (!isProductionDeploy && !url.startsWith("https://")) {
    if (process.env.ALLOW_INSECURE_AUTOLOGIN_URL !== "true") {
      throw new Error(
        `${envName}="${url}" 가 HTTPS 가 아닙니다. dev 환경에서 HTTP 를 허용하려면 ALLOW_INSECURE_AUTOLOGIN_URL=true 를 명시 설정하세요.`,
      );
    }
    console.warn(
      `[config] ${envName}="${url}" HTTP (ALLOW_INSECURE_AUTOLOGIN_URL=true) — prod 배포 시 부팅 실패합니다.`,
    );
  }
  return url;
}

export const AUTO_LOGIN_URL = {
  /** HANASYS DESIGN 자동로그인 — GET {dev|www}.hanasys.jp/login?autoLoginParam1={cipher} */
  hanasys: resolveAutoLoginUrl("HANASYS_AUTOLOGIN_URL"),
  /** Q.Order 자동로그인 — GET {q-order-domain}/eos/login/autoLogin?autoLoginParam1={cipher} */
  qOrder: resolveAutoLoginUrl("Q_ORDER_AUTOLOGIN_URL"),
  /** Q.Musubi 자동로그인 — GET {q-musubi-domain}/qm/login/autoLogin?autoLoginParam1={cipher} */
  qMusubi: resolveAutoLoginUrl("Q_MUSUBI_AUTOLOGIN_URL"),
} as const;

/**
 * 운영 자동로그인 URL 부팅 검증.
 *
 * 의도: HTTPS 누락 / 임의 host 주입 / userinfo 트릭(`https://www.hanasys.jp@attacker.example.com/...`)
 * 모두를 부팅 단계에서 차단하여 운영 사용자가 외부 URL 로 redirect 되어 cipher 가 유출되는
 * 사고를 fail-closed 로 방지.
 */
function assertProdAutoLoginUrl(envName: string, urlValue: string, expectedHost: string) {
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error(`${envName} is not a valid URL: ${urlValue}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${envName} must use HTTPS in production (got: ${parsed.protocol})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${envName} must not contain userinfo (open redirect risk)`);
  }
  // hostname 만 비교 (host 는 포트 포함). 의도를 코드로 명시하여 미래에 host ↔ hostname
  // 변경 시 검증 빈틈을 방지. 대소문자 정규화로 `WWW.HANASYS.JP` 같은 변형도 동일하게 처리.
  if (parsed.hostname.toLowerCase() !== expectedHost) {
    throw new Error(
      `${envName} hostname mismatch: expected "${expectedHost}", got "${parsed.hostname}"`,
    );
  }
  // 표준 HTTPS 포트(443) 외 거부. env 오타 / 의도치 않은 명시 포트 주입을 부팅 단계에서 차단.
  // (ex. https://www.hanasys.jp:8443/login → mismatch 로 차단되지 않고 통과되는 갭 방지)
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(
      `${envName} must use standard HTTPS port 443 (got: ${parsed.port}). Remove the explicit port or set it to 443.`,
    );
  }
}

// 운영 배포 안전장치 — HTTPS + host 화이트리스트 + userinfo 차단 + 표준 포트 검증.
// env 누락 자체는 resolveAutoLoginUrl 에서 이미 throw 되므로 여기서는 값의 적격성만 검사한다.
// 운영 Jenkins credential 에 HANASYS_AUTOLOGIN_URL / Q_ORDER_AUTOLOGIN_URL / Q_MUSUBI_AUTOLOGIN_URL
// 3개를 모두 명시 주입해야 부팅 성공.
// 빌드 단계는 스킵 — placeholder URL 이 host 화이트리스트에 막혀 빌드가 실패하지 않도록.
if (isProductionDeploy && !isBuildPhase) {
  assertProdAutoLoginUrl(
    "HANASYS_AUTOLOGIN_URL",
    AUTO_LOGIN_URL.hanasys,
    PROD_AUTOLOGIN_HOSTS.hanasys,
  );
  assertProdAutoLoginUrl(
    "Q_ORDER_AUTOLOGIN_URL",
    AUTO_LOGIN_URL.qOrder,
    PROD_AUTOLOGIN_HOSTS.qOrder,
  );
  assertProdAutoLoginUrl(
    "Q_MUSUBI_AUTOLOGIN_URL",
    AUTO_LOGIN_URL.qMusubi,
    PROD_AUTOLOGIN_HOSTS.qMusubi,
  );
}

// ─── Upload Storage ───

const rawUploadDir = process.env.UPLOAD_DIR?.trim();
if (isProductionDeploy && !isBuildPhase && !rawUploadDir) {
  throw new Error("UPLOAD_DIR is required in production");
}

/** 파일 업로드 저장 경로 — 환경변수로 주입, 미설정 시 프로젝트 루트 fallback (개발환경) */
export const UPLOAD_DIR = resolve(
  rawUploadDir || join(process.cwd(), "storage", "uploads"),
);

console.info("[config] UPLOAD_DIR =", UPLOAD_DIR);

// ─── SMTP ───

export const SMTP_DEFAULTS = {
  host: "smtp.alpha-prm.jp",
  port: 587,
  from: "q-partners@hqj.co.jp",
  fromName: "Q.PARTNERS事務局",
} as const;

// ─── Site ───

export const SITE_DEFAULTS = {
  url: "https://dev.q-partners.q-cells.jp",
  accsSiteCd: "QPARTNERS",
} as const;

// ─── Mass Mail ───

/**
 * 정수형 환경변수를 안전하게 파싱.
 * - 미설정/공백/NaN/비정수 → defaultValue 반환 + 경고 로그
 * - min/max 범위 밖 → 범위 내로 clamp + 경고 로그
 *
 * 잘못된 env 값으로 throttle 무한대기 / retryDelay NaN 등 운영 장애 방지.
 */
function parseIntEnv(
  name: string,
  defaultValue: number,
  opts?: { min?: number; max?: number },
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    console.warn(
      `[config] env "${name}" 값이 정수가 아님 ("${raw}") — 기본값 ${defaultValue} 사용`,
    );
    return defaultValue;
  }

  if (opts?.min !== undefined && parsed < opts.min) {
    console.warn(
      `[config] env "${name}"=${parsed} 가 최소값 ${opts.min} 미만 — 최소값으로 보정`,
    );
    return opts.min;
  }
  if (opts?.max !== undefined && parsed > opts.max) {
    console.warn(
      `[config] env "${name}"=${parsed} 가 최대값 ${opts.max} 초과 — 최대값으로 보정`,
    );
    return opts.max;
  }
  return parsed;
}

export const MASS_MAIL_DEFAULTS = {
  /** 건별 발송 간격 (ms) — SMTP rate limit / IP 블랙리스트 방지 (min:50 으로 burst 차단) */
  throttleMs: parseIntEnv("MASS_MAIL_THROTTLE_MS", 200, { min: 50, max: 60_000 }),
  /** 전체 장애 자동 재시도 횟수 (0 = 재시도 끄기) */
  maxRetries: parseIntEnv("MASS_MAIL_MAX_RETRIES", 3, { min: 0, max: 10 }),
  /** 전체 장애 재시도 간격 (ms) — min:1000 으로 일시 장애 시 즉시 재시도 폭주 방지 */
  retryDelayMs: parseIntEnv("MASS_MAIL_RETRY_DELAY_MS", 30_000, { min: 1000, max: 600_000 }),
  /** QSP 목록 조회 페이지당 건수 */
  pageSize: parseIntEnv("MASS_MAIL_PAGE_SIZE", 100, { min: 1, max: 1000 }),
  /** 페이징 안전장치 (1만건 상한) */
  maxPages: parseIntEnv("MASS_MAIL_MAX_PAGES", 100, { min: 1, max: 10_000 }),
  /** 자동 배치 cycle 간격 (ms) — 기본 3분. 0 = 배치 비활성 (테스트용). */
  batchIntervalMs: parseIntEnv("MASS_MAIL_BATCH_INTERVAL_MS", 3 * 60 * 1000, { min: 0, max: 60 * 60 * 1000 }),
  /** 좀비 감지 임계 (ms) — sending 상태가 이 시간 넘게 지속되면 send_failed 로 자동 승격 */
  zombieThresholdMs: parseIntEnv("MASS_MAIL_ZOMBIE_THRESHOLD_MS", 10 * 60 * 1000, { min: 60 * 1000, max: 24 * 60 * 60 * 1000 }),
  /** recipient 단위 30초 룰 상한 — retry_count 가 이 값에 도달하면 status='failed' */
  recipientMaxRetry: parseIntEnv("MASS_MAIL_RECIPIENT_MAX_RETRY", 3, { min: 1, max: 10 }),
  /** recipient 30초 룰 in-batch 간격 (ms) — SMTP 일시 거부 시 같은 recipient 재시도 전 대기 */
  recipientRetryDelayMs: parseIntEnv("MASS_MAIL_RECIPIENT_RETRY_DELAY_MS", 30_000, { min: 1000, max: 600_000 }),
} as const;
