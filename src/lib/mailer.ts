import nodemailer from "nodemailer";

import { SMTP_DEFAULTS } from "@/lib/config";

const isDev = process.env.NODE_ENV === "development";
/** Ethereal 사용 조건: 개발환경 + 명시적 opt-in (SMTP_USE_ETHEREAL=true) */
const useEtherealFlag = isDev && process.env.SMTP_USE_ETHEREAL === "true";

// Ethereal transporter 캐싱 (SMTP_USE_ETHEREAL=true 시, 프로세스 수명 동안 유지)
let etherealPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter() {
  // 명시적 opt-in: SMTP_USE_ETHEREAL=true 시 Ethereal 테스트 SMTP 사용 (실제 메일 미발송, 서버 로그에서 확인)
  if (useEtherealFlag) {
    if (!etherealPromise) {
      etherealPromise = (async () => {
        try {
          const testAccount = await nodemailer.createTestAccount();
          console.warn("[SMTP] ⚠ Ethereal 테스트 SMTP 사용 중 — 실제 메일이 발송되지 않습니다. SMTP_USE_ETHEREAL=true를 제거하면 실제 SMTP로 전환됩니다.");
          console.warn("[SMTP] Ethereal account: " + testAccount.user);
          return nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
          });
        } catch (error) {
          console.error("[SMTP] Ethereal 계정 생성 실패:", error);
          etherealPromise = null;
          throw new Error(
            "Ethereal 테스트 계정 생성 실패 — SMTP_PASS를 설정하여 실제 SMTP를 사용하세요.",
            { cause: error },
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

export interface SendMailResult {
  /** Ethereal 테스트 SMTP 사용 여부 (true이면 실제 메일 미발송) */
  ethereal: boolean;
  /** Ethereal 사용 시 미리보기 URL */
  previewUrl?: string;
}

/** 공용 메일 발송 유틸리티 */
export async function sendMail({ to, subject, html }: SendMailOptions): Promise<SendMailResult> {
  const from = process.env.SMTP_FROM ?? SMTP_DEFAULTS.from;
  const useEthereal = useEtherealFlag;

  let transporter: nodemailer.Transporter;
  try {
    transporter = await getTransporter();
  } catch (error) {
    if (useEthereal) etherealPromise = null;
    throw error;
  }

  let rawInfo: nodemailer.SentMessageInfo;
  try {
    rawInfo = await transporter.sendMail({
      from: `${SMTP_DEFAULTS.fromName} <${from}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    // Ethereal transporter send 실패 시 캐시 무효화 (세션 만료 등)
    // NOTE: Ethereal 장애 시 매 요청마다 createTestAccount 재시도됨 (dev-only이므로 허용)
    if (useEthereal) etherealPromise = null;
    throw error;
  }

  if (useEthereal) {
    const previewUrl = nodemailer.getTestMessageUrl(rawInfo) || undefined;
    const messageId = String(rawInfo?.messageId ?? "");
    const response = String(rawInfo?.response ?? "");
    const acceptedCount = Array.isArray(rawInfo?.accepted) ? rawInfo.accepted.length : 0;
    const rejectedCount = Array.isArray(rawInfo?.rejected) ? rawInfo.rejected.length : 0;
    if (previewUrl) {
      console.log("[sendMail] Preview URL: " + previewUrl);
    }
    console.log("[sendMail] result: " + JSON.stringify({
      messageId,
      response,
      acceptedCount,
      rejectedCount,
    }));
    return { ethereal: true, previewUrl };
  }

  return { ethereal: false };
}
