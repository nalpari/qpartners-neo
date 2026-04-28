import nodemailer from "nodemailer";

import { SMTP_DEFAULTS } from "@/lib/config";

// NOTE: Next.js 가 빌드 타임에 process.env.NODE_ENV 를 인라인하므로 next start 환경에서는
// 항상 "production" 으로 평가됨. 운영/비운영 식별은 APP_ENV(런타임 env) 로 통일.
const APP_ENV_RAW = process.env.APP_ENV;
const VALID_APP_ENV: ReadonlySet<string> = new Set(["production", "staging", "development"]);
if (APP_ENV_RAW && !VALID_APP_ENV.has(APP_ENV_RAW)) {
  // 알 수 없는 APP_ENV 값은 비운영(test redirect 활성 등) 으로 폴백되므로 운영 사고로 이어질 수 있음.
  // 부팅 1회 명시적 경고.
  console.warn(
    `[SMTP] ⚠ APP_ENV="${APP_ENV_RAW}" 가 화이트리스트(${Array.from(VALID_APP_ENV).join(", ")})에 없음. ` +
      `비운영으로 폴백 처리되며 mass-mail test redirect 가 활성화될 수 있음. APP_ENV 설정을 확인하세요.`,
  );
}
const isNonProd = APP_ENV_RAW !== "production";
/** Ethereal 사용 조건: 비운영 환경 + 명시적 opt-in (SMTP_USE_ETHEREAL=true) */
const useEtherealFlag = isNonProd && process.env.SMTP_USE_ETHEREAL === "true";

// Ethereal transporter 캐싱 (SMTP_USE_ETHEREAL=true 시, 프로세스 수명 동안 유지)
let etherealPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter() {
  // 명시적 opt-in: SMTP_USE_ETHEREAL=true 시 Ethereal 테스트 SMTP 사용 (실제 메일 미발송, 서버 로그에서 확인)
  if (useEtherealFlag) {
    if (!etherealPromise) {
      etherealPromise = (async () => {
        try {
          const testAccount = await nodemailer.createTestAccount();
          // 비밀번호는 throwaway 계정 자격증명이지만 로그 수집(Datadog/CloudWatch 등) 영구 보관 시
          // 인박스 접근 권한자가 발송 메일 본문(일본어 사용자명 등 PII 포함 가능)을 열람할 수 있는
          // 우회 경로가 됨 → prefix 만 노출, 전체 PW 가 필요하면 ethereal.email 에서 신규 발급 권장.
          const passPrefix = testAccount.pass.length > 4 ? `${testAccount.pass.slice(0, 4)}***` : "***";
          console.warn("[SMTP] ⚠ Ethereal 테스트 SMTP 사용 중 — 실제 메일이 발송되지 않습니다. SMTP_USE_ETHEREAL=true를 제거하면 실제 SMTP로 전환됩니다.");
          console.warn("[SMTP] Ethereal account: " + testAccount.user);
          console.warn(`[SMTP] Ethereal password (prefix only): ${passPrefix}`);
          console.warn("[SMTP] 전체 PW 필요 시 https://ethereal.email/create 에서 신규 계정 발급 권장 (throwaway 계정이지만 평문 로그 영구 보관 회피).");
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

/**
 * 메일 첨부파일 — nodemailer 의 attachments 옵션 중 안전한 부분만 노출.
 * - filename: 수신자 메일 클라이언트에 표시될 파일명 (원본 그대로)
 * - content: 메모리 버퍼 (호출부에서 디스크 1회 로드 후 전달, 매 발송마다 재사용 가능)
 */
export interface SendMailAttachment {
  filename: string;
  content: Buffer;
}

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  /**
   * BCC 수신자 — 단일 주소 또는 주소 배열.
   * 알림 메일(notification-mail) 등 운영 모니터링 용도로 사용.
   * dev/staging 에서 운영 주체 실주소 노출 방지는 호출부(send-notification.ts)에서 가드한다.
   */
  bcc?: string | string[];
  attachments?: SendMailAttachment[];
}

export interface SendMailResult {
  /** Ethereal 테스트 SMTP 사용 여부 (true이면 실제 메일 미발송) */
  ethereal: boolean;
  /** Ethereal 사용 시 미리보기 URL */
  previewUrl?: string;
}

/** 공용 메일 발송 유틸리티 */
export async function sendMail({ to, subject, html, bcc, attachments }: SendMailOptions): Promise<SendMailResult> {
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
      ...(bcc !== undefined ? { bcc } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
