import { MAIL_FOOTER_HTML } from "@/lib/mail-templates/footer";
import { escapeHtml } from "@/lib/mail-templates/utils";

interface TwoFactorMailParams {
  code: string;
}

export const TWO_FACTOR_SUBJECT = "【Q.PARTNERS】ログイン2段階認証番号のご案内";

/** 2차 인증 메일 HTML 템플릿 — Issue #2042: 일본어 단일 + 왼쪽 정렬 */
export function twoFactorMailHtml({ code }: TwoFactorMailParams): string {
  const safeCode = escapeHtml(code);

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;text-align:left;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0;padding:20px;text-align:left;">
  <tr><td style="text-align:left;">
    <p>こんにちは。</p>
    <p>ログイン2段階認証番号をご案内いたします。<br>
    下記の認証番号を入力してください。</p>
    <p style="margin:20px 0;padding:16px;background:#f5f5f5;border-radius:4px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:8px;">
      ${safeCode}
    </p>
    <p style="color:#666;font-size:12px;">
      ※ 認証番号は他人に共有しないでください。<br>
      ※ 10分が過ぎると自動的に無効となります。<br>
      ※ ご本人が要請していない場合は、直ちにパスワードを変更してください。
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:12px;color:#999;">
      このメールは、ご登録されたメールアドレス宛に自動的に送信されています。<br>
      本メールに心あたりが無い場合には、お手数ですがメールの件名もしくは本文の始めに
      「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:11px;color:#999;">
      ${MAIL_FOOTER_HTML}
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
