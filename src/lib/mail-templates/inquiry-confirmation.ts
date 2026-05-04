import { MAIL_FOOTER_HTML } from "@/lib/mail-templates/footer";
import { escapeHtml, formatReceivedAt } from "@/lib/mail-templates/utils";

interface InquiryConfirmationMailParams {
  userName: string;
  companyName: string;
  email: string;
  tel?: string;
  title: string;
  content: string;
  receivedAt: Date;
}

export const INQUIRY_CONFIRMATION_SUBJECT =
  "【Q.PARTNERS】お問い合わせを受け付けました";

/**
 * 작성자(고객) 접수 확인 메일 HTML 템플릿 (Redmine #2049, 첨부 4002.png 사양).
 * 문의 등록 직후 작성자에게 자동 발송된다.
 *
 * v2 변경사항 (Redmine #2049):
 *   - 일본어 단일화 (한국어 블록 전체 삭제)
 *   - 회사명을 작성자명 위에 표시
 *   - 표 7행 (受付日 / タイトル / 会社名 / 氏名 / メールアドレス / TEL / お問い合わせ内容)
 *   - 인사문/마감문을 사양에 맞춰 변경
 *   - 풋터를 공용 MAIL_FOOTER_HTML 로 단일화
 */
export function inquiryConfirmationMailHtml({
  userName,
  companyName,
  email,
  tel,
  title,
  content,
  receivedAt,
}: InquiryConfirmationMailParams): string {
  const safeUserName = escapeHtml(userName);
  // 비로그인/회사명 미입력 시 인사말 첫 줄이 비는 레이아웃 이슈 회피 — 빈값이면 회사명 행 자체 생략.
  // 표 내부 회사명 셀은 fallback "(未入力)" 로 일관성 유지.
  const trimmedCompanyName = companyName.trim();
  const safeCompanyNameLine = trimmedCompanyName ? `${escapeHtml(trimmedCompanyName)}<br>` : "";
  const safeCompanyNameCell = trimmedCompanyName ? escapeHtml(trimmedCompanyName) : "(未入力)";
  const safeEmail = escapeHtml(email);
  const safeTel = tel ? escapeHtml(tel) : "(未入力)";
  const safeTitle = escapeHtml(title);
  // 본문 줄바꿈 보존 — CRLF/CR/LF 모두 <br> 로 정규화
  const safeContent = escapeHtml(content).replace(/\r\n|\r|\n/g, "<br>");
  const safeReceivedAt = escapeHtml(formatReceivedAt(receivedAt));

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.6;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
  <tr><td style="text-align:left;">
    <p>${safeCompanyNameLine}${safeUserName} 様</p>

    <p>いつも「Q.PARTNERS」をご利用いただきまして、誠にありがとうございます。<br>
    以下の通り、お問い合わせを受け付けました。</p>

    <p style="margin:0;">【お問い合わせ内容】</p>
    <table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #ccc;border-bottom:1px solid #ccc;margin:8px 0 16px;">
      <tr><td style="background:#f5f5f5;width:30%;">お問い合わせ受付日</td><td>${safeReceivedAt}</td></tr>
      <tr><td style="background:#f5f5f5;">タイトル</td><td>${safeTitle}</td></tr>
      <tr><td style="background:#f5f5f5;">会社名</td><td>${safeCompanyNameCell}</td></tr>
      <tr><td style="background:#f5f5f5;">氏名</td><td>${safeUserName}</td></tr>
      <tr><td style="background:#f5f5f5;">メールアドレス</td><td>${safeEmail}</td></tr>
      <tr><td style="background:#f5f5f5;">TEL</td><td>${safeTel}</td></tr>
      <tr><td style="background:#f5f5f5;vertical-align:top;">お問い合わせ内容</td><td>${safeContent}</td></tr>
    </table>

    <p>頂きましたお問い合わせについて、現在弊社内で確認をしております。<br>
    返信につきましては追ってご連絡させていただきます。今しばらくお待ちください。</p>

    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:12px;color:#999;">
      このメールは、ご登録されたメールアドレス宛に自動的に送信されています。<br>
      本メールに心当たりが無い場合には、お手数ですがメールの件名もしくは本文の始めに
      「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。
    </p>
    <hr style="border:none;border-top:1px solid #ccc;margin:20px 0;">
    <p style="font-size:11px;color:#999;line-height:1.8;">
      ${MAIL_FOOTER_HTML}
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
