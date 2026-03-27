/**
 * 애플리케이션 설정 (push 대상)
 *
 * - API 엔드포인트 경로는 코드에서 관리
 * - base URL / 비밀값은 환경변수(.env)에서 주입
 */

// ─── QSP External API ───

const QSP_BASE_URL =
  process.env.QSP_BASE_URL ?? "https://jp-dev.qsalesplatform.com";

export const QSP_API = {
  /** QSP 로그인 */
  login: `${QSP_BASE_URL}/api/qpartners/user/login`,
  /** QSP 일반 회원가입 (newUserReq) */
  signup: `${QSP_BASE_URL}/api/qpartners/user/newUserReq`,
  /** QSP 유저정보 조회 (이메일 중복체크용) */
  userInfo: `${QSP_BASE_URL}/api/qpartners/user/userInfo`,
} as const;

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
} as const;
