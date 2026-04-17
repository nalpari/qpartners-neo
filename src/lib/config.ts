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
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !rawQspBaseUrl) {
  throw new Error("QSP_BASE_URL is required in production");
}

const QSP_BASE_URL = rawQspBaseUrl || "https://jp-dev.qsalesplatform.com";

if (isProduction && !QSP_BASE_URL.startsWith("https://")) {
  throw new Error("QSP_BASE_URL must use HTTPS in production");
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
  /** No.10 Q.Partners 회원관리 목록 조회 */
  userListMng: `${QSP_BASE_URL}/api/qpartners/userMng/userListMng`,
  /** No.12 Q.Partners 회원관리 정보 수정 — 부가 정보 수정 (2차인증, 뉴스레터, 로그인 알림, 뉴스 수신) */
  updateUserDtlMng: `${QSP_BASE_URL}/api/qpartners/userMng/updateUserDtlMng`,
} as const;

// ─── Upload Storage ───

const rawUploadDir = process.env.UPLOAD_DIR?.trim();
if (isProduction && !rawUploadDir) {
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
} as const;
