import { MAIL_FOOTER_HTML } from "@/lib/mail-templates/footer";
import { escapeHtml } from "@/lib/mail-templates/utils";

interface PasswordResetMailParams {
  resetUrl: string;
}

export const PASSWORD_RESET_SUBJECT = "【Q.PARTNERS】パスワード再設定のご案内";

/** 비밀번호 변경 링크 메일 HTML 템플릿 (화면설계서 p.12 기반, 일본어) */
export function passwordResetMailHtml({
  resetUrl,
}: PasswordResetMailParams): string {
  if (!/^https?:\/\//.test(resetUrl)) {
    throw new Error(`Invalid resetUrl: ${resetUrl}`);
  }

  const safeResetUrl = escapeHtml(resetUrl);

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0;padding:20px;">
  <tr><td>
    <p>こんにちは。</p>
    <p>パスワード再設定のご依頼を受け付けましたので、ご案内いたします。<br>
    下記のリンクをクリックし、パスワードを変更してください。</p>
    <p style="margin:20px 0;">
      <a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">パスワード変更リンク</a>
    </p>
    <p style="color:#666;font-size:12px;">※セキュリティ保護のため、本リンクは一定時間経過後に無効となります。</p>
    <p style="margin:10px 0;">よろしくお願いいたします。</p>
    <p style="font-size:11px;color:#999;">
      ${MAIL_FOOTER_HTML}
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
