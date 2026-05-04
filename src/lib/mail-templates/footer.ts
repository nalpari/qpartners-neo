/**
 * 메일 본문 공통 풋터 (Q.PARTNERS事務局 연락처 블록).
 *
 * 적용 대상:
 *   - signup-complete.ts (회원가입 완료 메일)
 *   - inquiry-confirmation.ts (문의 접수 확인 메일)
 *   - notification-mail/attr-change-mail.ts (회원정보 변경 알림)
 *   - notification-mail/login-mail.ts (로그인 알림)
 *
 * Tel 번호(03-5441-5976) 는 사무국 직통이며, 페이지 footer(0120-801-170) 와는 다름 — 의도된 구분.
 *
 * 동적 값 없음(전부 정적 리터럴) → escape 불필요. 향후 동적 값 추가 시 호출부에서 escapeHtml 처리.
 */

const FOOTER_LINES: readonly string[] = [
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ハンファジャパン株式会社",
  "Q.PARTNERS事務局",
  "Tel:03-5441-5976",
  "Email : q-partners@hqj.co.jp",
  "問い合わせ受付時間：平日10：00-12：00 13：00-17：00",
  "※土曜、日曜、祝日にお問合せをいただいた場合は、翌営業日以降に順次対応いたします",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
];

/** `<pre>` 또는 plain-text 컨텍스트용 (개행 `\n`) */
export const MAIL_FOOTER_TEXT: string = FOOTER_LINES.join("\n");

/** `<p>` / `<div>` 등 HTML 컨텍스트용 (개행 `<br>`) */
export const MAIL_FOOTER_HTML: string = FOOTER_LINES.join("<br>\n");
