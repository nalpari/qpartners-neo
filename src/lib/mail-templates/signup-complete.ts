import { MAIL_FOOTER_HTML } from "@/lib/mail-templates/footer";
import { escapeHtml } from "@/lib/mail-templates/utils";

interface SignupCompleteMailParams {
  userNm: string;
  email: string;
  siteUrl: string;
}

/** 회원가입 승인완료 메일 HTML 템플릿 (화면설계서 p.19 기반, 일본어+한국어) */
export function signupCompleteMailHtml({
  userNm,
  email,
  siteUrl,
}: SignupCompleteMailParams): string {
  let origin: string;
  try {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid siteUrl protocol");
    }
    origin = parsed.origin;
  } catch {
    throw new Error("Invalid siteUrl");
  }

  const safeUserNm = escapeHtml(userNm);
  const safeEmail = escapeHtml(email);
  const loginUrl = new URL("/login", origin).toString();

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0;padding:20px;">
  <tr><td>
    <p>${safeUserNm} 様</p>
    <p>この度は、Q.PARTNERSへの会員登録をいただき、誠にありがとうございます。<br>
    会員登録が完了いたしましたのでお知らせいたします。</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#f8f9fa;border-radius:4px;">
      <tr>
        <td style="padding:15px 20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#666;">登録メールアドレス</p>
          <p style="margin:0;font-weight:bold;">${safeEmail}</p>
        </td>
      </tr>
    </table>
    <p>以下のリンクよりログインし、サービスをご利用ください。</p>
    <p style="margin:20px 0;">
      <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">ログインはこちら</a>
    </p>
    <p style="color:#666;font-size:12px;">
      ※本メールにお心当たりのない場合はご利用状況をご確認の上、ご不明な場合は下記連絡先までお問い合わせ下さい。<br>
      ※本メールアドレスは送信専用です。返信いただきましてもお返事できませんので、ご了承ください
    </p>
    <p style="margin:10px 0;">よろしくお願いいたします。</p>
    <p style="font-size:11px;color:#999;">
      ${MAIL_FOOTER_HTML}
    </p>
  </td></tr>
</table>
</body>
</html>`;
}

export const SIGNUP_COMPLETE_SUBJECT = "[Q.PARTNERS] 会員登録完了のお知らせ";
