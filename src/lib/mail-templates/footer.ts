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

/**
 * 사무국 풋터 텍스트 라인 — text/HTML/RichEditor 표현이 동일 출처를 공유하도록 export.
 *
 * 사용처:
 *   - MAIL_FOOTER_TEXT / MAIL_FOOTER_HTML : 시스템 메일 템플릿
 *   - DEFAULT_BULK_MAIL_BODY_HTML(bulk-mail-types.ts) : 대량메일 에디터 기본 서명
 */
export const FOOTER_LINES: readonly string[] = [
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ハンファジャパン株式会社",
  "Q.PARTNERS事務局",
  "Tel:03-5441-5976",
  "Email : q-partners@hqj.co.jp",
  "問い合わせ受付時間：平日 10:00 ~ 12:00 / 13:00 ~ 18:00",
  "※土曜、日曜、祝日にお問合せをいただいた場合は、翌営業日以降に順次対応いたします",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
];

/** `<pre>` 또는 plain-text 컨텍스트용 (개행 `\n`) */
export const MAIL_FOOTER_TEXT: string = FOOTER_LINES.join("\n");

/** `<p>` / `<div>` 등 HTML 컨텍스트용 (개행 `<br>`) */
export const MAIL_FOOTER_HTML: string = FOOTER_LINES.join("<br>\n");
