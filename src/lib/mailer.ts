import nodemailer from "nodemailer";

import { SMTP_DEFAULTS } from "@/lib/config";

const isDev = process.env.NODE_ENV !== "production";

// Ethereal transporter 캐싱 (비프로덕션 + SMTP_PASS 미설정 시, 프로세스 수명 동안 유지)
let etherealPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter() {
  // 비프로덕션 + SMTP_PASS 미설정 시: Ethereal 테스트 SMTP 사용 (실제 메일 미발송, 브라우저에서 확인)
  if (isDev && !process.env.SMTP_PASS) {
    if (!etherealPromise) {
      etherealPromise = (async () => {
        try {
          const testAccount = await nodemailer.createTestAccount();
          console.warn("[SMTP] ⚠ Ethereal 테스트 SMTP 사용 중 — 실제 메일이 발송되지 않습니다. SMTP_PASS를 설정하면 실제 SMTP로 전환됩니다.");
          console.warn("[SMTP] Ethereal account: " + testAccount.user);
          return nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
          });
        } catch (error) {
          etherealPromise = null;
          throw new Error(
            "Ethereal 테스트 계정 생성 실패 — SMTP_PASS를 설정하여 실제 SMTP를 사용하세요. " +
            (error instanceof Error ? error.message : String(error)),
          );
        }
      })();
    }
    return etherealPromise;
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
    requireTLS: port !== 465, // 465 이외 포트에서 STARTTLS 강제 (587 등)
    auth: { user: user!, pass: pass! },
  });
}

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

/** 공용 메일 발송 유틸리티 */
export async function sendMail({ to, subject, html }: SendMailOptions): Promise<void> {
  const from = process.env.SMTP_FROM ?? SMTP_DEFAULTS.from;
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: `${SMTP_DEFAULTS.fromName} <${from}>`,
    to,
    subject,
    html,
  });

  // 비프로덕션 + Ethereal 사용 시: 미리보기 URL + 상세 결과 출력
  if (isDev && !process.env.SMTP_PASS) {
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
