import { MAIL_FOOTER_HTML } from "@/lib/mail-templates/footer";
import { escapeHtml, formatReceivedAt } from "@/lib/mail-templates/utils";

import { LOGIN_NOTIFICATION_MAIL_SUBJECT } from "./constants";
import { sendNotificationMail } from "./send-notification";

/**
 * 로그인 알림 메일 빌더 + 발송 헬퍼 (Redmine #2125 사양).
 *
 * 발송 조건은 호출부에서 `loginNotiYn === "Y" && email` 가드 통과 후 진입.
 * 본 모듈은 본문 빌드 + sendNotificationMail 위임만 수행.
 *
 * 본문 사양 (Redmine #2125):
 *   ${userNm}様
 *
 *   平素より格別のお引き立てありがとうございます。
 *   以下ログインが確認されましたので、お知らせいたします。
 *
 *   ログイン日時：${loginAt JST}
 *   IPアドレス：${clientIp ?? "不明"}
 *
 *   お心当たりのない方は、第三者のログインの可能性がありますので、
 *   ログインパスワードの再設定をお願い致します。
 *
 *   [공용 풋터 — MAIL_FOOTER_HTML]
 */

export interface LoginNotificationContext {
  /** 회원 본인 이메일 (호출부에서 falsy 가드 후 진입) */
  to: string;
  /** 본문 인사말. null/빈문자열 가능 → "お客様" 폴백 */
  userNm: string | null;
  /** 로그인 시점 (서버 발송 시점). JST 표기 */
  loginAt: Date;
  /** 클라이언트 IP. 추출 불가 시 null → 본문 `不明` 표기 */
  clientIp: string | null;
  /** 호출부 식별 prefix — 로깅용 */
  callerRoute: string;
}

function buildBodyHtml(args: {
  userNm: string;
  loginAtJst: string;
  ipText: string;
}): string {
  const safeUserNm = escapeHtml(args.userNm);
  const safeLoginAt = escapeHtml(args.loginAtJst);
  const safeIp = escapeHtml(args.ipText);

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0;padding:20px;">
  <tr><td>
    <p>${safeUserNm}様</p>
    <p>平素より格別のお引き立てありがとうございます。<br>
    以下ログインが確認されましたので、お知らせいたします。</p>
    <p>ログイン日時：${safeLoginAt}<br>
    IPアドレス：${safeIp}</p>
    <p>お心当たりのない方は、第三者のログインの可能性がありますので、ログインパスワードの再設定をお願い致します。</p>
    <p style="font-size:11px;color:#999;">
      ${MAIL_FOOTER_HTML}
    </p>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * 로그인 알림 발송.
 * 호출 패턴 (login route):
 *   if (qsp.data.loginNotiYn === "Y" && qsp.data.email) {
 *     void sendLoginNotification({ to, userNm, loginAt, clientIp, callerRoute });
 *   }
 */
export async function sendLoginNotification(ctx: LoginNotificationContext): Promise<void> {
  const userNm = ctx.userNm?.trim() ? ctx.userNm.trim() : "お客様";
  const html = buildBodyHtml({
    userNm,
    loginAtJst: formatReceivedAt(ctx.loginAt),
    ipText: ctx.clientIp ?? "不明",
  });

  await sendNotificationMail({
    to: ctx.to,
    subject: LOGIN_NOTIFICATION_MAIL_SUBJECT,
    html,
    callerRoute: ctx.callerRoute,
  });
}
