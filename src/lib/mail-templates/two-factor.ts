import { escapeHtml } from "@/lib/mail-templates/utils";

interface TwoFactorMailParams {
  code: string;
}

export const TWO_FACTOR_SUBJECT =
  "【Q.PARTNERS】ログイン2段階認証番号のご案内 / [Q.PARTNERS] 로그인 2차 인증번호 안내";

/** 2차 인증 메일 HTML 템플릿 (화면설계서 p.15 기반, 일본어+한국어) */
export function twoFactorMailHtml({ code }: TwoFactorMailParams): string {
  const safeCode = escapeHtml(code);

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
  <tr><td>
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
    <p>안녕하세요.</p>
    <p>로그인 2차 인증번호를 안내드립니다.<br>
    아래 인증번호를 입력해 주세요.</p>
    <p style="margin:20px 0;padding:16px;background:#f5f5f5;border-radius:4px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:8px;">
      ${safeCode}
    </p>
    <p style="color:#666;font-size:12px;">
      ※ 인증번호는 타인에게 공유하지 마세요.<br>
      ※ 10분이 지나면 자동으로 만료됩니다.<br>
      ※ 본인이 요청하지 않은 경우, 즉시 비밀번호를 변경해 주세요.
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
