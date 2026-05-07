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
    <p>よろしくお願いいたします。</p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:12px;color:#999;">
      このメールは、ご登録されたメールアドレス宛に自動的に送信されています。<br>
      本メールに心あたりが無い場合には、お手数ですがメールの件名もしくは本文の始めに
      「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:11px;color:#999;">
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br>
      ハンファジャパン株式会社<br>
      Q.PARTNERS事務局<br>
      Tel:03-5441-5976<br>
      Email : q-partners@hqj.co.jp<br>
      問い合わせ受付時間：平日10：00-12：00 13：00-17：00<br>
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
