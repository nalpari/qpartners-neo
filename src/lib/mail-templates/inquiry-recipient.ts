import { escapeHtml } from "@/lib/mail-templates/utils";

interface InquiryRecipientMailParams {
  inquiryTypeName: string;
  companyName: string;
  userName: string;
  email: string;
  tel?: string;
  title: string;
  content: string;
}

// 담당자/작성자 메일 제목 구분을 위해 담당자용에는 "【新規】" 접두사를 부여한다
export const INQUIRY_RECIPIENT_SUBJECT =
  "【Q.PARTNERS】お問い合わせを受け付けました";

/**
 * 수신 담당자용 문의 알림 메일 HTML 템플릿 (화면설계서 p.42-43, design 2장)
 * 공통코드 INQUIRY_TYPE.relCode1~3 에 등록된 담당자 메일로 발송된다.
 */
export function inquiryRecipientMailHtml(params: InquiryRecipientMailParams): string {
  const safeInquiryTypeName = escapeHtml(params.inquiryTypeName);
  const safeCompanyName = escapeHtml(params.companyName);
  const safeUserName = escapeHtml(params.userName);
  const safeEmail = escapeHtml(params.email);
  const safeTel = params.tel ? escapeHtml(params.tel) : "(未入力)";
  const safeTitle = escapeHtml(params.title);
  // 본문 줄바꿈 보존 — CRLF/CR/LF 모두 <br> 로 정규화
  const safeContent = escapeHtml(params.content).replace(/\r\n|\r|\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0;padding:20px;">
  <tr><td>
    <p>Q.PARTNERS事務局 ご担当者様</p>
    <p>お問い合わせフォームから新規のお問い合わせを受け付けましたのでご連絡いたします。<br>
    内容をご確認のうえ、対応をお願いいたします。</p>

    <table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #ccc;border-bottom:1px solid #ccc;margin:16px 0;">
      <tr><td style="background:#f5f5f5;width:30%;">お問い合わせ種別</td><td>${safeInquiryTypeName}</td></tr>
      <tr><td style="background:#f5f5f5;">会社名</td><td>${safeCompanyName}</td></tr>
      <tr><td style="background:#f5f5f5;">氏名</td><td>${safeUserName}</td></tr>
      <tr><td style="background:#f5f5f5;">メールアドレス</td><td>${safeEmail}</td></tr>
      <tr><td style="background:#f5f5f5;">電話番号</td><td>${safeTel}</td></tr>
      <tr><td style="background:#f5f5f5;">タイトル</td><td>${safeTitle}</td></tr>
      <tr><td style="background:#f5f5f5;vertical-align:top;">内容</td><td>${safeContent}</td></tr>
    </table>

    <p>よろしくお願いいたします。</p>

    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:11px;color:#999;">
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br>
      ハンファジャパン株式会社<br>
      Q.PARTNERS事務局<br>
      Tel:03-5441-5976<br>
      Email : q-partners@hqj.co.jp<br>
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
