/** HTML 특수문자 이스케이프 (XSS 방지) */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  if (!/^https?:\/\//.test(siteUrl)) {
    throw new Error(`Invalid siteUrl: ${siteUrl}`);
  }

  const safeUserNm = escapeHtml(userNm);
  const safeEmail = escapeHtml(email);
  const loginUrl = `${siteUrl}/login`;
  const mypageUrl = `${siteUrl}/mypage`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Yu Gothic','Meiryo',sans-serif;background-color:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:30px 40px 20px;border-bottom:3px solid #003d7a;">
        <h1 style="margin:0;font-size:20px;color:#003d7a;">Q.PARTNERS</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 40px;">
        <p style="margin:0 0 20px;font-size:14px;line-height:1.8;color:#333333;">
          ${safeUserNm} 様
        </p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.8;color:#333333;">
          この度は、Q.PARTNERSへの会員登録をいただき、誠にありがとうございます。<br>
          会員登録が完了いたしましたのでお知らせいたします。
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#f8f9fa;border-radius:4px;">
          <tr>
            <td style="padding:15px 20px;">
              <p style="margin:0 0 8px;font-size:13px;color:#666666;">登録メールアドレス</p>
              <p style="margin:0;font-size:14px;color:#333333;font-weight:bold;">${safeEmail}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.8;color:#333333;">
          以下のリンクよりログインし、サービスをご利用ください。
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:12px 30px;background-color:#003d7a;border-radius:4px;">
              <a href="${loginUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">ログインはこちら</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.8;color:#666666;">
          マイページ: <a href="${mypageUrl}" style="color:#003d7a;">${mypageUrl}</a>
        </p>
        <hr style="margin:20px 0;border:none;border-top:1px solid #eeeeee;">
        <p style="margin:0 0 20px;font-size:13px;line-height:1.8;color:#999999;">
          ※このメールに心当たりがない場合は、お手数ですが破棄してください。<br>
          ※본 메일은 Q.PARTNERS 회원가입 완료 안내입니다. 관련 없는 경우 삭제해 주세요.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 40px;background-color:#f8f9fa;text-align:center;">
        <p style="margin:0;font-size:12px;color:#999999;">
          Q.PARTNERS事務局<br>
          &copy; Hanwha Qcells Japan
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const SIGNUP_COMPLETE_SUBJECT = "[Q.PARTNERS] 会員登録完了のお知らせ";
