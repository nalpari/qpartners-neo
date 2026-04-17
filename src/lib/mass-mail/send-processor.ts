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
import { escapeHtml } from "@/lib/mail-templates/utils";
import { collectRecipients } from "@/lib/mass-mail/collect-recipients";
import type { CollectTargets } from "@/lib/mass-mail/collect-recipients";
import { prisma } from "@/lib/prisma";

const LOG_TAG = "[mass-mail/send-processor]";

/**
 * 동시 트리거(또는 외부 status 변경)로 인해 낙관적 락이 풀려 status 전이를 못한 케이스.
 * - 선행 호출이 이미 처리 중이므로 send_failed 로 마킹하지 않고 조용히 종료.
 * - sentinel string 매칭 대신 instanceof 로 안전 식별.
 */
class StatusTransitionLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusTransitionLostError";
  }
}

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
  // body는 POST/PUT 단계에서 DOMPurify로 sanitize 완료된 HTML.
  // senderName은 사용자 입력 평문 → 반드시 escape (stored XSS / 피싱 방어).
  const safeSenderName = escapeHtml(senderName);
  return `
<div style="font-family: sans-serif; max-width: 600px;">
${body}
<hr />
<p style="font-size: 12px; color: #888;">
このメールはQ.PARTNERSから送信されています。<br/>
送信者: ${safeSenderName}
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

  // 집계 컬럼 갱신 — updateMany + count 검사 (count=0 = 레코드 누락 → counter drift)
  if (successCount > 0 || failedCount > 0) {
    const aggResult = await prisma.massMail.updateMany({
      where: { id: massMailId },
      data: {
        sentSuccess: { increment: successCount },
        sentFailed: { increment: failedCount },
      },
    });
    if (aggResult.count === 0) {
      console.error(
        `${LOG_TAG} 집계 컬럼 갱신 실패 (count=0) — massMailId: ${massMailId} 레코드 누락. counter drift 가능 (success: ${successCount}, failed: ${failedCount})`,
      );
    }
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
      select: { id: true, status: true },
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

    // 중복 트리거 방지 — 이미 수신자가 INSERT 되어 있으면 발송 루프만 재실행
    const existingRecipients = await prisma.massMailRecipient.count({ where: { massMailId } });
    if (existingRecipients > 0) {
      console.warn(
        `${LOG_TAG} 수신자 이미 존재 — 발송 루프만 재실행 (recipients=${existingRecipients})`,
      );
      await runWithRetry(massMailId, throttleMs, maxRetries, retryDelayMs);
      return;
    }

    // 1. 이메일 수집 + INSERT + status 전이
    const collected = await collectAndQueueRecipients(massMailId, "pending");
    if (collected === 0) return; // 수집 0건 — 이미 sent 처리됨

    // 2. 발송 루프 — 실패 시 전체 재시도
    await runWithRetry(massMailId, throttleMs, maxRetries, retryDelayMs);
  } catch (error: unknown) {
    // 중복 트리거로 인한 status 전이 실패는 정상 케이스 (선행 호출이 처리 중) — markSendFailed 스킵
    if (error instanceof StatusTransitionLostError) {
      console.warn(
        `${LOG_TAG} 동시 트리거 감지 — 선행 처리 중으로 판단하고 종료 (${error.message})`,
      );
      return;
    }
    console.error(`${LOG_TAG} processMassMailSend 최종 실패 — massMailId: ${massMailId}`, error);
    await markSendFailed(massMailId, error);
  }
}

/**
 * 재발송 엔트리 — 재발송 라우트가 status="sending" 으로 전이한 후 호출됨.
 * - recipients 가 있으면: sendLoop 만 재실행 (pending 수신자만 이어서 발송)
 * - recipients 가 없으면: 수집 실패 후 재시도 케이스 → 수집부터 재실행
 */
export async function processMassMailRetry(massMailId: number): Promise<void> {
  const throttleMs = MASS_MAIL_DEFAULTS.throttleMs;
  const maxRetries = MASS_MAIL_DEFAULTS.maxRetries;
  const retryDelayMs = MASS_MAIL_DEFAULTS.retryDelayMs;

  try {
    const existingRecipients = await prisma.massMailRecipient.count({ where: { massMailId } });
    if (existingRecipients === 0) {
      console.warn(
        `${LOG_TAG} 재발송 진입 시 수신자 0건 — 수집 실패 복구 루트로 전환 (massMailId: ${massMailId})`,
      );
      // 수집 실패 복구: status="sending" 상태에서 수집 + INSERT 재실행
      const collected = await collectAndQueueRecipients(massMailId, "sending");
      if (collected === 0) return; // 수집 결과 0건이면 이미 sent 처리됨
    }
    await runWithRetry(massMailId, throttleMs, maxRetries, retryDelayMs);
  } catch (error: unknown) {
    // 동일하게 중복 트리거 케이스는 markSendFailed 스킵
    if (error instanceof StatusTransitionLostError) {
      console.warn(
        `${LOG_TAG} 재발송 중 동시 트리거 감지 — 선행 처리 중으로 판단하고 종료 (${error.message})`,
      );
      return;
    }
    console.error(`${LOG_TAG} processMassMailRetry 최종 실패 — massMailId: ${massMailId}`, error);
    await markSendFailed(massMailId, error);
  }
}

/**
 * 이메일 수집 + 수신자 bulk INSERT + sent_total 갱신 (status 전이 포함).
 *
 * @param massMailId  대상 메일 ID
 * @param fromStatus  낙관적 락 조건 — 현재 status. "pending"(POST/PUT 경로) 또는 "sending"(retry 복구 경로)
 * @returns 수집된 수신자 건수. 0 반환 시 status="sent" + sentTotal=0 으로 조기 종료된 상태
 */
async function collectAndQueueRecipients(
  massMailId: number,
  fromStatus: "pending" | "sending",
): Promise<number> {
  const mail = await prisma.massMail.findUnique({
    where: { id: massMailId },
    select: {
      userId: true,
      createdBy: true,
      targetSuperAdmin: true,
      targetAdmin: true,
      targetFirstStore: true,
      targetSecondStore: true,
      targetConstructor: true,
      targetGeneral: true,
      optOut: true,
    },
  });
  if (!mail) throw new Error(`MassMail not found: ${massMailId}`);

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
    const earlyResult = await prisma.massMail.updateMany({
      where: { id: massMailId, status: fromStatus },
      data: { status: "sent", sentAt: new Date(), sentTotal: 0 },
    });
    if (earlyResult.count === 0) {
      console.warn(
        `${LOG_TAG} 0건 sent 전이 count=0 — status 이미 변경됨 (massMailId: ${massMailId})`,
      );
    }
    return 0;
  }

  // 중복 트리거 방어: status 전이를 createMany 이전에 실행 (낙관적 락).
  // - 동시 트리거 시 두번째 호출은 count=0 → 트랜잭션 롤백 → createMany 미실행
  // - @@unique([massMailId, email]) 제약과 함께 DB 레벨 이중 방어
  // - timeout 30초: 대량 수신자(최대 maxPages×pageSize) createMany 시 기본 5초 초과 방지 (P2028 회피)
  await prisma.$transaction(
    async (tx) => {
      const transitionResult = await tx.massMail.updateMany({
        where: { id: massMailId, status: fromStatus },
        data: { status: "sending", sentTotal: recipients.length },
      });
      if (transitionResult.count === 0) {
        // 동시 트리거 또는 외부 상태 변경 — 롤백
        throw new StatusTransitionLostError(
          `massMailId=${massMailId}, expected=${fromStatus}`,
        );
      }
      await tx.massMailRecipient.createMany({
        data: recipients.map((r) => ({
          massMailId,
          email: r.email,
          userName: r.userName,
          authRole: r.authRole,
          // 이전 버전에 생성돼 createdBy 가 null 인 legacy MassMail 재발송 시에도
          // 감사 흔적을 남기기 위해 작성자 userId 로 fallback
          createdBy: mail.createdBy ?? mail.userId,
        })),
      });
    },
    { timeout: 30_000 },
  );

  return recipients.length;
}

/** sendLoop 을 최대 maxRetries 회 재시도 — 성공 시 status="sent" 로 최종 확정 */
async function runWithRetry(
  massMailId: number,
  throttleMs: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<void> {
  // totalAttempts = 최초 시도 1회 + 재시도 maxRetries 회
  const totalAttempts = 1 + Math.max(0, maxRetries);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      await sendLoop(massMailId, throttleMs);
      // 전원 완료 — 낙관적 락으로 status="sending" 에서만 "sent" 전이
      // (외부에서 send_failed 로 변경되었거나 이미 sent 인 경우 덮어쓰지 않음)
      const sentResult = await prisma.massMail.updateMany({
        where: { id: massMailId, status: "sending" },
        data: { status: "sent", sentAt: new Date() },
      });
      if (sentResult.count === 0) {
        // 외부에서 status 가 이미 변경됨 (sent/send_failed/draft 등)
        console.warn(
          `${LOG_TAG} status="sent" 전이 count=0 — sending 상태 아님 (외부 변경 가능성). massMailId: ${massMailId}`,
        );
      }
      if (attempt > 1) {
        console.log(`${LOG_TAG} 재시도 성공 — massMailId: ${massMailId}, attempt: ${attempt}/${totalAttempts}`);
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `${LOG_TAG} 발송 루프 실패 (attempt ${attempt}/${totalAttempts}) — massMailId: ${massMailId}, error: ${message}`,
      );
      if (attempt < totalAttempts) await sleep(retryDelayMs);
    }
  }

  // 모든 시도 실패 — 최종 실패
  throw lastError instanceof Error
    ? lastError
    : new Error(`최초 시도 + 재시도 ${maxRetries}회 모두 실패`, { cause: lastError });
}

/**
 * 최종 실패 시 status=send_failed 로 전이.
 * DB 업데이트 자체 실패 시 최대 3회 재시도 (1초 간격) — 영구 "sending" 좀비 방지.
 * 끝까지 실패하면 CRITICAL 로그를 남겨 운영자 수동 개입 유도.
 */
async function markSendFailed(massMailId: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_TAG} status=send_failed 전이 — massMailId: ${massMailId}, reason: ${message}`);

  const MAX_TRANSITION_ATTEMPTS = 3;
  const TRANSITION_RETRY_MS = 1000;
  let lastUpdateError: unknown = null;

  for (let attempt = 1; attempt <= MAX_TRANSITION_ATTEMPTS; attempt++) {
    try {
      // 낙관적 락 — pending/sending 에서만 전이.
      // - "sending": 발송 루프 진입 후 실패 (정상 케이스)
      // - "pending": collectAndQueueRecipients 자체 실패 (수집/QSP/SEKO 우회 등) — pending 좀비 방지
      // sent/send_failed 등 다른 상태는 덮어쓰지 않음
      const result = await prisma.massMail.updateMany({
        where: { id: massMailId, status: { in: ["pending", "sending"] } },
        data: { status: "send_failed" },
      });
      if (result.count === 0) {
        // 이미 다른 상태(sent / send_failed / draft 등)로 전환된 케이스 — 재시도 무의미
        console.warn(
          `${LOG_TAG} status=send_failed 전이 count=0 — pending/sending 아닌 상태 (이미 처리됨). 재시도 중단. massMailId: ${massMailId}`,
        );
        return;
      }
      return;
    } catch (updateError: unknown) {
      lastUpdateError = updateError;
      console.error(
        `${LOG_TAG} status=send_failed 전이 실패 (attempt ${attempt}/${MAX_TRANSITION_ATTEMPTS}) — massMailId: ${massMailId}`,
        updateError,
      );
      if (attempt < MAX_TRANSITION_ATTEMPTS) await sleep(TRANSITION_RETRY_MS);
    }
  }

  // 최종 실패 — status 가 sending 상태로 영구 잔존할 수 있음 (좀비 방지를 위한 CRITICAL 로그)
  console.error(
    `${LOG_TAG} CRITICAL — status=send_failed 전이 최종 실패, massMailId=${massMailId} 가 "sending" 상태로 잔존. 운영자 수동 개입 필요.`,
    lastUpdateError,
  );
}

