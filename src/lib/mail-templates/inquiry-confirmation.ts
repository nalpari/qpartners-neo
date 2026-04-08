import { escapeHtml } from "@/lib/mail-templates/utils";

interface InquiryConfirmationMailParams {
  userName: string;
  inquiryTypeName: string;
  title: string;
}

export const INQUIRY_CONFIRMATION_SUBJECT =
  "【Q.PARTNERS】お問い合わせを受け付けました / [Q.PARTNERS] 문의 접수 안내";

/**
 * 작성자(고객) 접수 확인 메일 HTML 템플릿 (화면설계서 p.42-43, design 2장)
 * 문의 등록 직후 작성자에게 자동 발송된다.
 */
export function inquiryConfirmationMailHtml({
  userName,
  inquiryTypeName,
  title,
}: InquiryConfirmationMailParams): string {
  const safeUserName = escapeHtml(userName);
  const safeInquiryTypeName = escapeHtml(inquiryTypeName);
  const safeTitle = escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
  <tr><td>
    <p>${safeUserName} 様</p>
    <p>この度は、Q.PARTNERSへお問い合わせいただき誠にありがとうございます。<br>
    下記の内容でお問い合わせを受け付けいたしました。</p>

    <table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #ccc;border-bottom:1px solid #ccc;margin:16px 0;">
      <tr><td style="background:#f5f5f5;width:30%;">お問い合わせ種別</td><td>${safeInquiryTypeName}</td></tr>
      <tr><td style="background:#f5f5f5;">タイトル</td><td>${safeTitle}</td></tr>
    </table>

    <p>担当者より、内容を確認のうえ順次ご返信いたします。<br>
    お時間をいただく場合がございますので、予めご了承ください。</p>

    <p>今後とも Q.PARTNERS をよろしくお願いいたします。</p>

    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <div lang="ko">
      <p style="margin:20px 0;">
        ${safeUserName} 님<br><br>
        Q.PARTNERS에 문의해 주셔서 진심으로 감사드립니다.<br>
        아래 내용으로 문의가 접수되었습니다.<br><br>
        • 문의 유형: ${safeInquiryTypeName}<br>
        • 제목: ${safeTitle}<br><br>
        담당자가 확인 후 순차적으로 답변드리겠습니다. 시간이 소요될 수 있는 점 양해 부탁드립니다.
      </p>
    </div>

    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:12px;color:#999;">
      このメールは、ご登録されたメールアドレス宛に自動的に送信されています。<br>
      本メールに心あたりが無い場合には、お手数ですがメールの件名もしくは本文の始めに
      「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。
    </p>
    <p lang="ko" style="font-size:12px;color:#999;">
      이 메일은 등록하신 메일 주소로 자동 전송되고 있습니다.<br>
      본 메일에 짐작가는 바가 없는 경우에는 번거로우시겠지만 메일 제목 혹은 본문 시작에
      「등록의 기억 없음」이라고 기재해 회신(q-partners@hqj.co.jp)해 주세요.
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:11px;color:#999;">
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br>
      ハンファジャパン株式会社 / <span lang="ko">한화재팬 주식회사</span><br>
      Q.PARTNERS事務局 / <span lang="ko">Q.PARTNERS 사무국</span><br>
      Tel:03-5441-5976<br>
      Email : q-partners@hqj.co.jp<br>
      問い合わせ受付時間：平日10：00-12：00 13：00-17：00<br>
      <span lang="ko">문의접수시간 : 평일10:00-12:00 13:00-17:00</span><br>
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
