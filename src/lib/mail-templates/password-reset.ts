import { escapeHtml } from "@/lib/mail-templates/utils";

interface PasswordResetMailParams {
  resetUrl: string;
}

export const PASSWORD_RESET_SUBJECT =
  "【Q.PARTNERS】パスワード再設定のご案内 / [Q.PARTNERS] 비밀번호 재설정 안내";

/** 비밀번호 변경 링크 메일 HTML 템플릿 (화면설계서 p.12 기반, 일본어+한국어) */
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
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
  <tr><td>
    <p>こんにちは。</p>
    <p>パスワード再設定のご依頼を受け付けましたので、ご案内いたします。<br>
    下記のリンクをクリックし、パスワードを変更してください。</p>
    <p style="margin:20px 0;">
      <a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">パスワード変更リンク / 비밀번호 변경 링크</a>
    </p>
    <p style="color:#666;font-size:12px;">※セキュリティ保護のため、本リンクは一定時間経過後に無効となります。<br>
    ※ 보안을 위해 해당 링크는 일정 시간 후 만료됩니다.</p>
    <p>よろしくお願いいたします。<br>감사합니다.</p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="margin:20px 0;">
      안녕하세요.<br><br>
      비밀번호 재설정 요청이 접수되어 안내드립니다.<br>
      아래 링크를 클릭하여 비밀번호를 변경해 주세요.
    </p>
    <p style="margin:20px 0;">
      <a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">비밀번호 변경 링크</a>
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:12px;color:#999;">
      このメールは、ご登録されたメールアドレス宛に自動的に送信されています。<br>
      本メールに心あたりが無い場合には、お手数ですがメールの件名もしくは本文の始めに
      「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:12px;color:#999;">
      이 메일은 등록하신 메일 주소로 자동적으로 전송되고 있습니다.<br>
      본 메일에 짐작가는 바가 없는 경우에는, 번거로우시겠지만 메일의 제목 혹은 본문을 시작할때
      「등록의 기억 없음」이라고 기재해, 본 메일에 회신(q-partners@hqj.co.jp)해 주세요.
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:11px;color:#999;">
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br>
      ハンファジャパン株式会社 / 한화재팬 주식회사<br>
      Q.PARTNERS事務局 / Q.PARTNERS 사무국<br>
      Tel:03-5441-5976<br>
      Email : q-partners@hqj.co.jp<br>
      問い合わせ受付時間：平日10：00-12：00 13：00-17：00<br>
      문의접수시간 : 평일10:00-12:00 13:00-17:00<br>
      ※ 토요일,일요일,공휴일에 문의를 주신 경우는,<br>
      다음 영업일 이후에 순차적으로 대응하겠습니다.<br>
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
