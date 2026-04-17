/**
 * 대량메일 비동기 발송 처리
 *
 * Fire-and-Forget 패턴으로 호출되어 수신자 수집 → 순차 발송까지 담당.
 * - 전체 장애(SMTP 다운 등) 발생 시 자동 재시도 (기본 3회, 30초 간격)
 * - 개별 건 실패는 해당 건만 failed 처리, 나머지 계속 진행
 * - 재시도 진입 시 이미 sent 처리된 건은 건너뜀 (중복 발송 없음)
 *
 * Plan: mass-mail-send.plan.md §3, §6
 * Design: mass-mail-send.design.md §3
 */

import { MASS_MAIL_DEFAULTS } from "@/lib/config";
import { sendMail } from "@/lib/mailer";
import { collectRecipients } from "@/lib/mass-mail/collect-recipients";
import type { CollectTargets } from "@/lib/mass-mail/collect-recipients";
import { prisma } from "@/lib/prisma";

const LOG_TAG = "[mass-mail/send-processor]";

interface SendProcessorOptions {
  massMailId: number;
  /** 건별 지연 (ms) — 기본 MASS_MAIL_DEFAULTS.throttleMs */
  throttleMs?: number;
  /** 전체 장애 자동 재시도 횟수 — 기본 MASS_MAIL_DEFAULTS.maxRetries */
  maxRetries?: number;
  /** 재시도 간격 (ms) — 기본 MASS_MAIL_DEFAULTS.retryDelayMs */
  retryDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMailHtml(body: string, senderName: string): string {
  return `
<div style="font-family: sans-serif; max-width: 600px;">
${body}
<hr />
<p style="font-size: 12px; color: #888;">
このメールはQ.PARTNERSから送信されています。<br/>
送信者: ${senderName}
</p>
</div>`;
}

/**
 * 단일 발송 루프 — recipients.status="pending" 만 조회하여 건별 발송.
 * - 전체 장애 판정: 루프 완료 후에도 pending 이 남아있으면 throw
 */
async function sendLoop(massMailId: number, throttleMs: number): Promise<void> {
  const massMail = await prisma.massMail.findUnique({
    where: { id: massMailId },
    select: { subject: true, body: true, senderName: true },
  });
  if (!massMail) throw new Error(`MassMail not found: ${massMailId}`);

  const html = buildMailHtml(massMail.body, massMail.senderName);

  // pending 수신자 조회 — 건수 많을 수 있으므로 순차 loop
  const pendings = await prisma.massMailRecipient.findMany({
    where: { massMailId, status: "pending" },
    select: { id: true, email: true },
  });

  console.log(`${LOG_TAG} 발송 루프 시작 — massMailId: ${massMailId}, pending: ${pendings.length}건`);

  let successCount = 0;
  let failedCount = 0;

  for (const recipient of pendings) {
    try {
      await sendMail({
        to: recipient.email,
        subject: massMail.subject,
        html,
      });
      await prisma.massMailRecipient.update({
        where: { id: recipient.id },
        data: { status: "sent", sentAt: new Date() },
      });
      successCount++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.massMailRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "failed",
          errorMessage: message.slice(0, 500),
        },
      });
      failedCount++;
      console.error(`${LOG_TAG} 개별 발송 실패 — recipientId: ${recipient.id}, error: ${message}`);
    }

    // 건별 throttle
    if (throttleMs > 0) await sleep(throttleMs);
  }

  // 집계 컬럼 갱신
  if (successCount > 0 || failedCount > 0) {
    await prisma.massMail.update({
      where: { id: massMailId },
      data: {
        sentSuccess: { increment: successCount },
        sentFailed: { increment: failedCount },
      },
    });
  }

  console.log(
    `${LOG_TAG} 발송 루프 종료 — massMailId: ${massMailId}, 성공: ${successCount}건, 실패: ${failedCount}건`,
  );

  // 루프 완료 후 여전히 pending 이 있으면 전체 장애 간주
  const remaining = await prisma.massMailRecipient.count({
    where: { massMailId, status: "pending" },
  });
  if (remaining > 0) {
    throw new Error(`루프 완료 후에도 pending 수신자 ${remaining}건 잔존 — 전체 장애 간주`);
  }
}

/**
 * 비동기 발송 처리 — status=pending 진입 시 호출되는 메인 엔트리.
 * Fire-and-Forget 으로 호출하여 반환 Promise는 await 불필요.
 */
export async function processMassMailSend(options: SendProcessorOptions): Promise<void> {
  const massMailId = options.massMailId;
  const throttleMs = options.throttleMs ?? MASS_MAIL_DEFAULTS.throttleMs;
  const maxRetries = options.maxRetries ?? MASS_MAIL_DEFAULTS.maxRetries;
  const retryDelayMs = options.retryDelayMs ?? MASS_MAIL_DEFAULTS.retryDelayMs;

  try {
    const mail = await prisma.massMail.findUnique({
      where: { id: massMailId },
      select: {
        id: true,
        status: true,
        senderName: true,
        userId: true,
        targetSuperAdmin: true,
        targetAdmin: true,
        targetFirstStore: true,
        targetSecondStore: true,
        targetConstructor: true,
        targetGeneral: true,
        optOut: true,
      },
    });
    if (!mail) {
      console.error(`${LOG_TAG} MassMail 레코드 없음 — massMailId: ${massMailId}`);
      return;
    }
    if (mail.status !== "pending") {
      console.warn(
        `${LOG_TAG} status=pending 아님 — 처리 스킵 (현재 status=${mail.status}, massMailId: ${massMailId})`,
      );
      return;
    }

    // 중복 트리거 방지 — 이미 수신자가 INSERT 되어 있으면 재발송 루트로 전환
    const existingRecipients = await prisma.massMailRecipient.count({ where: { massMailId } });
    if (existingRecipients > 0) {
      console.warn(
        `${LOG_TAG} 수신자 이미 존재 — 재발송 루트로 전환 (recipients=${existingRecipients})`,
      );
      await runWithRetry(massMailId, throttleMs, maxRetries, retryDelayMs);
      return;
    }

    // 1. 이메일 수집
    const targets: CollectTargets = {
      targetSuperAdmin: mail.targetSuperAdmin,
      targetAdmin: mail.targetAdmin,
      targetFirstStore: mail.targetFirstStore,
      targetSecondStore: mail.targetSecondStore,
      targetConstructor: mail.targetConstructor,
      targetGeneral: mail.targetGeneral,
      optOut: mail.optOut,
    };

    const recipients = await collectRecipients(targets, LOG_TAG, mail.userId);

    if (recipients.length === 0) {
      console.warn(`${LOG_TAG} 수집된 발송대상 없음 — massMailId: ${massMailId}`);
      await prisma.massMail.update({
        where: { id: massMailId },
        data: { status: "sent", sentAt: new Date(), sentTotal: 0 },
      });
      return;
    }

    // 2. 수신자 bulk INSERT + sent_total 갱신 + status="sending" 전이 (낙관적 락)
    await prisma.$transaction([
      prisma.massMailRecipient.createMany({
        data: recipients.map((r) => ({
          massMailId,
          email: r.email,
          userName: r.userName,
          authRole: r.authRole,
        })),
      }),
      prisma.massMail.updateMany({
        where: { id: massMailId, status: "pending" },
        data: {
          status: "sending",
          sentTotal: recipients.length,
        },
      }),
    ]);

    // 3. 발송 루프 — 실패 시 전체 재시도
    await runWithRetry(massMailId, throttleMs, maxRetries, retryDelayMs);
  } catch (error: unknown) {
    console.error(`${LOG_TAG} processMassMailSend 최종 실패 — massMailId: ${massMailId}`, error);
    await markSendFailed(massMailId, error);
  }
}

/**
 * 재발송 엔트리 — send_failed 상태에서 pending 수신자만 이어서 발송.
 * 수집/INSERT 없이 sendLoop 만 재실행.
 */
export async function processMassMailRetry(massMailId: number): Promise<void> {
  const throttleMs = MASS_MAIL_DEFAULTS.throttleMs;
  const maxRetries = MASS_MAIL_DEFAULTS.maxRetries;
  const retryDelayMs = MASS_MAIL_DEFAULTS.retryDelayMs;

  try {
    await runWithRetry(massMailId, throttleMs, maxRetries, retryDelayMs);
  } catch (error: unknown) {
    console.error(`${LOG_TAG} processMassMailRetry 최종 실패 — massMailId: ${massMailId}`, error);
    await markSendFailed(massMailId, error);
  }
}

/** sendLoop 을 최대 maxRetries 회 재시도 — 성공 시 status="sent" 로 최종 확정 */
async function runWithRetry(
  massMailId: number,
  throttleMs: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<void> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      await sendLoop(massMailId, throttleMs);
      // 전원 완료 — status=sent + sentAt
      await prisma.massMail.update({
        where: { id: massMailId },
        data: { status: "sent", sentAt: new Date() },
      });
      if (attempt > 0) {
        console.log(`${LOG_TAG} 재시도 성공 — massMailId: ${massMailId}, attempt: ${attempt}`);
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      attempt++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `${LOG_TAG} 발송 루프 실패 (attempt ${attempt}/${maxRetries}) — massMailId: ${massMailId}, error: ${message}`,
      );
      if (attempt > maxRetries) break;
      await sleep(retryDelayMs);
    }
  }

  // 최대 재시도 초과 — 최종 실패
  throw lastError instanceof Error
    ? lastError
    : new Error(`재시도 ${maxRetries}회 초과`, { cause: lastError });
}

/** 최종 실패 시 status=send_failed 로 전이 (DB 업데이트 자체 실패는 로그만) */
async function markSendFailed(massMailId: number, error: unknown): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_TAG} status=send_failed 전이 — massMailId: ${massMailId}, reason: ${message}`);
    await prisma.massMail.update({
      where: { id: massMailId },
      data: { status: "send_failed" },
    });
  } catch (updateError: unknown) {
    console.error(
      `${LOG_TAG} status=send_failed 전이 실패 — massMailId: ${massMailId}`,
      updateError,
    );
  }
}

