import { sendMail } from "@/lib/mailer";

import { NOTIFICATION_MAIL_BCC } from "./constants";

interface SendNotificationOptions {
  /** 회원 본인 이메일 */
  to: string;
  subject: string;
  html: string;
  /** 호출부 식별 prefix — 로깅용 ([PUT /api/...] 등) */
  callerRoute: string;
}

/**
 * 알림 메일(로그인/속성 변경) 공통 발송 헬퍼.
 *
 * 정책:
 *   1. 운영 주체 BCC 는 운영 환경에서만 적용 — dev/staging 에서는 자동 제거
 *      (`hasegawa.j@qcells.com` 등 실주소가 비운영에서 잘못 발송되는 사고 방지).
 *      mass-mail-test-redirect 와 동일한 fail-safe 정책.
 *   2. 발송 실패는 warn 로깅만, 절대 throw 하지 않음 → 호출부의 본 API 응답에 영향 X.
 *      알림 메일은 부수효과이므로 본 비즈니스 로직(프로필 업데이트, 로그인) 보다 우선순위 낮음.
 *   3. PII 보호: 본문/주소 평문 로깅 금지. 발송 결과 메타(ethereal, bcc 적용 여부)만 기록.
 */
export async function sendNotificationMail(opts: SendNotificationOptions): Promise<void> {
  const isProd = process.env.APP_ENV === "production";
  const bcc = isProd ? [...NOTIFICATION_MAIL_BCC] : undefined;

  try {
    const result = await sendMail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(bcc ? { bcc } : {}),
    });
    console.log(`${opts.callerRoute} 알림 메일 발송 완료`, {
      ethereal: result.ethereal,
      bccApplied: !!bcc,
      previewUrl: result.previewUrl,
    });
  } catch (error) {
    console.warn(`${opts.callerRoute} 알림 메일 발송 실패 (응답 무영향)`, error);
  }
}
