import nodemailer from "nodemailer";

import { SMTP_DEFAULTS } from "@/lib/config";

function getTransporter() {
  const host = process.env.SMTP_HOST ?? SMTP_DEFAULTS.host;
  const portStr = process.env.SMTP_PORT ?? String(SMTP_DEFAULTS.port);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const missing = [
    !user && "SMTP_USER",
    !pass && "SMTP_PASS",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`SMTP 환경변수 미설정: ${missing.join(", ")}`);
  }

  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`SMTP_PORT 값이 올바르지 않습니다: "${portStr}"`);
  }

  return nodemailer.createTransport({
    host: host!,
    port,
    secure: port === 465,
    requireTLS: port !== 465, // 587 사용 시 STARTTLS 강제
    auth: { user: user!, pass: pass! },
  });
}

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

/** 메일 발송 유틸리티 (password-reset, signup 등 공용) */
export async function sendMail({ to, subject, html }: SendMailOptions): Promise<void> {
  const from = process.env.SMTP_FROM ?? SMTP_DEFAULTS.from;
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `${SMTP_DEFAULTS.fromName} <${from}>`,
    to,
    subject,
    html,
  });
}
