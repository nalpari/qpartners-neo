import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP 환경변수가 설정되지 않았습니다 (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
  });
}

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

/** 메일 발송 유틸리티 (password-reset, signup 등 공용) */
export async function sendMail({ to, subject, html }: SendMailOptions): Promise<void> {
  const from = process.env.SMTP_FROM ?? "q-partners@hqj.co.jp";
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `Q.PARTNERS事務局 <${from}>`,
    to,
    subject,
    html,
  });
}
