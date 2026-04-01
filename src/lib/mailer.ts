import nodemailer from "nodemailer";

import { SMTP_DEFAULTS } from "@/lib/config";

const isDev = process.env.NODE_ENV !== "production";

// Ethereal transporter 캐싱 (dev 전용, 매 호출마다 계정 생성 방지)
let cachedEtherealTransporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  // 개발환경: Ethereal 테스트 SMTP (실제 메일 미발송, 브라우저에서 확인)
  if (isDev && !process.env.SMTP_PASS) {
    if (!cachedEtherealTransporter) {
      const testAccount = await nodemailer.createTestAccount();
      console.log("[SMTP] Ethereal test account: " + testAccount.user);
      cachedEtherealTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    }
    return cachedEtherealTransporter;
  }

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
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: `${SMTP_DEFAULTS.fromName} <${from}>`,
    to,
    subject,
    html,
  });

  if (isDev) {
    // 개발환경: Ethereal 미리보기 URL + 상세 결과 출력
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log("[sendMail] Preview URL: " + previewUrl);
    }
    console.log("[sendMail] result: " + JSON.stringify({
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
    }));
  }
}
