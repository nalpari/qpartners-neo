/**
 * 알림 메일 (로그인/속성 변경) 공통 상수.
 *
 * AS-IS oldQpartners `sitemanage/ini/const_mail.php` 미러링.
 * 운영 주체 BCC 는 dev 환경에서 차단되므로 (send-notification.ts) 안전하게 노출 가능.
 */

/**
 * 운영 주체 BCC.
 * AS-IS const_mail.php:93-96 (MAIL_EDIT_USER_BCC) 동일.
 * dev/staging 에서는 send-notification.ts 가 자동 제거.
 *
 * 환경변수 `NOTIFICATION_MAIL_BCC` (콤마 구분) 가 설정되어 있으면 우선 사용.
 * 미설정 시 기본값 사용.
 */
const DEFAULT_BCC = [
  "hasegawa.j@qcells.com",
  "q-partners@hqj.co.jp",
];

export const NOTIFICATION_MAIL_BCC: string[] = process.env.NOTIFICATION_MAIL_BCC
  ? process.env.NOTIFICATION_MAIL_BCC.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_BCC;

/**
 * 속성 변경 알림 메일 제목.
 * AS-IS const_mail.php:90 (MAIL_EDIT_USER_TITLE) 동일.
 */
export const ATTR_CHANGE_MAIL_SUBJECT = "【Q.PARTNERS】会員情報変更完了のお知らせ";

/**
 * 로그인 알림 메일 제목 (Redmine #2125 사양 확정, 2026-05-04).
 */
export const LOGIN_NOTIFICATION_MAIL_SUBJECT = "【Q.PARTNERS】ログインのお知らせ";
