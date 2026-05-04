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

import { readFile } from "fs/promises";
import { resolve } from "path";

import { stat } from "fs/promises";

import { MASS_MAIL_DEFAULTS, UPLOAD_DIR } from "@/lib/config";
import { maskEmail } from "@/lib/interface-logger";
import { sendMail } from "@/lib/mailer";
import type { SendMailAttachment } from "@/lib/mailer";
import { escapeHtml } from "@/lib/mail-templates/utils";
import { collectRecipients } from "@/lib/mass-mail/collect-recipients";
import type { CollectTargets } from "@/lib/mass-mail/collect-recipients";
import { isPermanentSmtpFailure, ORPHAN_SEND_SENTINEL } from "@/lib/mass-mail/constants";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import type { RecipientAuthRole } from "@/generated/prisma/client";

const LOG_TAG = "[mass-mail/send-processor]";

/**
 * 현재 발송 파이프라인(수집+sendLoop+promote)이 실행 중인 massMailId 집합.
 * auto-retry-batch 가 배치 cycle 에서 진입 직전 이 값을 확인해 in-flight 와의 경합
 * (중복 SMTP 발송 / QSP userListMng 이중 호출 / 좀비 오판정) 을 차단.
 *
 * globalThis 에 보관 — Next.js dev HMR 시 모듈 재-import 로 새 Set 이 생성돼
 * 가드가 우회되는 것을 방지. PM2 single instance 가정은 유지 (다중 인스턴스 시 분산 락 필요).
 */
type SendProcessorGlobals = { __inFlightMassMails?: Set<number> };
const sendProcessorGlobals = globalThis as unknown as SendProcessorGlobals;
export const inFlightMassMails: Set<number> =
  sendProcessorGlobals.__inFlightMassMails ??
  (sendProcessorGlobals.__inFlightMassMails = new Set<number>());

/**
 * 발송 파이프라인 중복 진입 차단 가드.
 * - 이미 inFlightMassMails 에 있으면 조용히 skip (log)
 * - 없으면 add → work() 실행 → finally delete
 */
export async function runWithInFlightGuard(
  massMailId: number,
  work: () => Promise<void>,
): Promise<void> {
  if (inFlightMassMails.has(massMailId)) {
    console.warn(`${LOG_TAG} massMailId ${massMailId} 이미 진행 중 — 중복 진입 skip`);
    return;
  }
  inFlightMassMails.add(massMailId);
  try {
    await work();
  } finally {
    inFlightMassMails.delete(massMailId);
  }
}

/**
 * 하트비트 주기 (ms) — 마지막 갱신 이후 이 시간이 지나면 mass_mail.updatedAt 을 touch.
 * 좀비 감지 threshold (기본 10분) 보다 충분히 짧게 설정해 소규모 발송도 오판정되지 않도록 함.
 */
const HEARTBEAT_INTERVAL_MS = 60_000;

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

/**
 * 첨부파일 총 사이즈 상한 (Buffer 메모리 점유 가드 — OOM 방지).
 * 단일 mass_mail 의 첨부 합계가 이 값을 넘으면 발송을 거부.
 *
 * 25MB = 일반 SMTP 첨부 한계와 일치. 동시에 여러 mass_mail 이 sendLoop 진입해도
 * 누적 점유가 예측 가능하도록 상한을 둠.
 */
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * 대량메일 첨부파일을 메모리에 1회 로드.
 *
 * sendLoop 진입 시 호출 — 같은 첨부 객체를 모든 recipient sendMail 호출에 재사용해
 * recipient × attachment 회 디스크 read 폭주를 방지.
 *
 * 보안:
 *   - filePath 는 UPLOAD_DIR 기준 상대경로로 저장됨 → resolve 후 isInsideDir 로 traversal 차단
 *   - isRegularFile 로 symlink/특수파일 거부 (path-safety.ts 패턴 일치)
 *   - 검증 실패 / read 실패 파일이 1건이라도 있으면 throw → sendLoop 의 catch 가 markSendFailed
 *     로 전이. 운영자가 등록한 첨부가 누락된 채 status='sent' 로 종결되는 사고를 차단
 *     (코드리뷰 HIGH #4: silent skip 시 운영자 인지 불가 + path-traversal 알람 묻힘).
 *   - 첨부 총 사이즈가 MAX_TOTAL_ATTACHMENT_BYTES 초과 시 throw (OOM 가드).
 */
async function loadMassMailAttachments(massMailId: number): Promise<SendMailAttachment[]> {
  const rows = await prisma.massMailAttachment.findMany({
    where: { massMailId },
    select: { fileName: true, filePath: true },
    orderBy: { id: "asc" },
  });

  if (rows.length === 0) return [];

  // 1. 사이즈 사전 집계 — read 전에 stat 으로 합계 검증해 큰 파일을 메모리로 끌어올리지 않음.
  let totalBytes = 0;
  for (const row of rows) {
    const absolutePath = resolve(UPLOAD_DIR, row.filePath);
    if (!isInsideDir(absolutePath, UPLOAD_DIR)) {
      throw new Error(
        `첨부파일 경로 traversal 차단 — massMailId=${massMailId}, filePath=${row.filePath}. 발송 거부.`,
      );
    }
    if (!(await isRegularFile(absolutePath))) {
      throw new Error(
        `첨부파일 정규 파일 아님 (symlink/특수파일/누락) — massMailId=${massMailId}, filePath=${row.filePath}. 발송 거부.`,
      );
    }
    try {
      const st = await stat(absolutePath);
      totalBytes += st.size;
    } catch (error: unknown) {
      throw new Error(
        `첨부파일 stat 실패 — massMailId=${massMailId}, filePath=${row.filePath}. 발송 거부. cause=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(
      `첨부파일 총 사이즈 상한 초과 — massMailId=${massMailId}, total=${totalBytes}B, limit=${MAX_TOTAL_ATTACHMENT_BYTES}B. 발송 거부.`,
    );
  }

  // 2. 검증된 파일을 메모리로 read.
  const loaded: SendMailAttachment[] = [];
  for (const row of rows) {
    const absolutePath = resolve(UPLOAD_DIR, row.filePath);
    try {
      const content = await readFile(absolutePath);
      loaded.push({ filename: row.fileName, content });
    } catch (error: unknown) {
      throw new Error(
        `첨부파일 read 실패 — massMailId=${massMailId}, filePath=${row.filePath}. 발송 거부. cause=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `${LOG_TAG} 첨부파일 로드 완료 — massMailId=${massMailId}, 대상 ${rows.length}건, 총 ${totalBytes}B`,
  );
  return loaded;
}

/**
 * SMTP 에러 메시지를 DB 에 저장하기 전에 수신자 이메일을 마스킹.
 *
 * nodemailer 가 throw 하는 5xx 에러 메시지에는 SMTP 응답 본문이 그대로 포함되며,
 * 본문에 수신자 이메일이 평문으로 박혀 있는 경우가 많다 (예: "550 5.1.1 <user@example.com> User unknown").
 * 이 메시지가 `qp_mass_mail_recipients.error_message` 에 저장되면 운영자 모달의
 * `failedRecipients` 응답으로 PII 가 평문 노출됨 (코드리뷰 HIGH #5).
 *
 * 메시지 안의 모든 이메일 주소를 `interface-logger.maskEmail` 정책과 동일하게 치환.
 */
function sanitizeErrorMessage(message: string): string {
  return message.replace(/[\w.+-]+@[\w.-]+\.[\w.-]+/g, (email) => maskEmail(email));
}

/**
 * 단일 recipient 에 대한 SMTP 발송 — 권한별 실 회원 이메일로 1건 발송.
 */
async function sendOneRecipient(
  recipient: { email: string; authRole: RecipientAuthRole },
  subject: string,
  html: string,
  attachments: SendMailAttachment[],
): Promise<void> {
  await sendMail({
    to: recipient.email,
    subject,
    html,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
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
 * 단일 발송 루프 — recipients.status="pending" + retryCount < recipientMaxRetry 만 조회하여 건별 발송.
 *
 * **30초 룰** — Plan §3.4 / Design §4.6 (mass-mail-send)
 * - 같은 recipient 에 대해 SMTP 실패 시 retry_count 증분 후 in-batch 30초 대기 → 같은 recipient 재시도
 * - retry_count 가 recipientMaxRetry (기본 3) 도달 시 status='failed' 로 영구 마킹
 * - 어느 시도에서 성공하면 status='sent' (retry_count 도 증분되어 실제 시도 횟수 보존)
 *
 * **불변량**
 * - recipient.retry_count ≤ recipientMaxRetry
 * - retry_count == recipientMaxRetry → status ∈ {sent, failed} (pending 아님)
 *
 * 루프 완료 후 pending 이 남아있으면 DB/네트워크 장애로 간주 → throw (runWithRetry 가 이어받음).
 */
/**
 * 단일 발송 루프 본체. 직접 호출 금지 — processMassMailSend / processMassMailRetry /
 * auto-retry-batch 가 runWithInFlightGuard 로 감싼 뒤 호출해야 중복 진입이 차단됨.
 */
export async function sendLoop(massMailId: number, throttleMs: number): Promise<void> {
  const massMail = await prisma.massMail.findUnique({
    where: { id: massMailId },
    select: { subject: true, body: true, senderName: true },
  });
  if (!massMail) throw new Error(`MassMail not found: ${massMailId}`);

  const html = buildMailHtml(massMail.body, massMail.senderName);
  const attachments = await loadMassMailAttachments(massMailId);
  const maxRetry = MASS_MAIL_DEFAULTS.recipientMaxRetry;
  const retryDelayMs = MASS_MAIL_DEFAULTS.recipientRetryDelayMs;

  const pendings = await prisma.massMailRecipient.findMany({
    where: { massMailId, status: "pending", retryCount: { lt: maxRetry } },
    select: { id: true, email: true, retryCount: true, authRole: true },
  });

  console.log(`${LOG_TAG} 발송 루프 시작 — massMailId: ${massMailId}, pending: ${pendings.length}건 (retry 여력 있음)`);

  let successCount = 0;
  let failedCount = 0;
  let lastHeartbeatAt = Date.now();

  for (const recipient of pendings) {
    let currentRetryCount = recipient.retryCount;
    let resolved = false;

    // 30초 룰: 같은 recipient 에 대해 retry_count < max 동안 반복
    while (!resolved && currentRetryCount < maxRetry) {
      let smtpOk = false;
      try {
        await sendOneRecipient(recipient, massMail.subject, html, attachments);
        smtpOk = true;
      } catch (error: unknown) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        // errorMessage DB 저장 시 SMTP 응답 본문에 포함된 수신자 이메일을 마스킹.
        // 예: "550 5.1.1 <user@example.com> User unknown" → "550 5.1.1 <u***@example.com> User unknown"
        // (코드리뷰 HIGH #5: failedRecipients 응답으로 노출 시 PII 노출).
        const persistedMessage = sanitizeErrorMessage(rawMessage);

        // SMTP 5xx 영구 실패 → retry 무의미 → 즉시 failed 마킹 (30초 대기 + 재시도 skip).
        // retry_count 는 max 로 설정하여 다음 cycle 의 sendLoop where 절 (retryCount<max) 에서 자동 제외.
        // 불변량 유지: retry_count == max → status ∈ {sent, failed}.
        if (isPermanentSmtpFailure(error)) {
          try {
            await prisma.massMailRecipient.update({
              where: { id: recipient.id },
              data: {
                status: "failed",
                retryCount: maxRetry,
                errorMessage: persistedMessage.slice(0, 500),
              },
            });
            failedCount++;
          } catch (dbError: unknown) {
            console.error(
              `${LOG_TAG} CRITICAL — recipient ${recipient.id} 영구 실패 (5xx) DB 마킹 실패. 다음 cycle 에서 복구 시도.`,
              dbError,
            );
          }
          console.warn(
            `${LOG_TAG} recipient ${recipient.id} SMTP 영구 실패 (5xx) — retry skip. error: ${persistedMessage}`,
          );
          resolved = true;
          break;
        }

        currentRetryCount++;

        if (currentRetryCount >= maxRetry) {
          try {
            await prisma.massMailRecipient.update({
              where: { id: recipient.id },
              data: {
                status: "failed",
                retryCount: currentRetryCount,
                errorMessage: persistedMessage.slice(0, 500),
              },
            });
            failedCount++;
          } catch (dbError: unknown) {
            // 현 recipient 만 포기 (outer for 는 계속). DB 상 retry_count 는 갱신 전 값 유지 →
            // 다음 cycle 에서 이 recipient 가 한 번 더 시도될 수 있음 (in-memory max 도달이지만
            // DB 는 max-1 로 남아 재진입 허용). SMTP 재호출 가능성 있으나 복구 경로로 허용.
            console.error(
              `${LOG_TAG} CRITICAL — recipient ${recipient.id} 영구 실패 DB 갱신 실패. retry_count drift 가능 (in-memory=${currentRetryCount}). 다음 cycle 에서 복구 시도.`,
              dbError,
            );
            resolved = true;
            break;
          }
          console.warn(
            `${LOG_TAG} recipient ${recipient.id} 영구 실패 (retry_count=${currentRetryCount}/${maxRetry}) — error: ${persistedMessage}`,
          );
          resolved = true;
        } else {
          try {
            await prisma.massMailRecipient.update({
              where: { id: recipient.id },
              data: {
                retryCount: currentRetryCount,
                errorMessage: persistedMessage.slice(0, 500),
              },
            });
          } catch (dbError: unknown) {
            // 현 recipient inner-while 만 종료하고 outer for 는 계속 — 다음 recipient 로 진행.
            // DB 는 갱신 전 retry_count 유지. pending 상태라 다음 배치 cycle 에서 재처리됨.
            console.error(
              `${LOG_TAG} CRITICAL — recipient ${recipient.id} retry_count 증분 DB 갱신 실패. 현 recipient 포기, 다음 recipient 진행 (다음 cycle 에서 복구).`,
              dbError,
            );
            resolved = true;
            break;
          }
          console.warn(
            `${LOG_TAG} recipient ${recipient.id} 시도 ${currentRetryCount}/${maxRetry} 실패 — ${retryDelayMs}ms 후 재시도. error: ${persistedMessage}`,
          );
          await sleep(retryDelayMs);
        }
      }

      // sendMail 성공 경로 — DB 갱신은 별도 try/catch 로 분리.
      // 1차 성공 update 실패 시 pending 유지되면 다음 cycle 에서 SMTP 재호출 → 중복 발송.
      // 이를 차단하기 위해 2차로 status='failed' 마킹 (실제 메일은 나갔으나 집계상 실패로 기록,
      // errorMessage 로 orphan 식별 가능). 운영자 수동 확인 플래그.
      if (smtpOk) {
        try {
          await prisma.massMailRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "sent",
              sentAt: new Date(),
              retryCount: currentRetryCount + 1,
            },
          });
          successCount++;
        } catch (dbError: unknown) {
          console.error(
            `${LOG_TAG} CRITICAL — recipient ${recipient.id} SMTP 성공 / DB 갱신 실패. 중복 발송 방지 위해 failed 전이 시도.`,
            dbError,
          );
          try {
            await prisma.massMailRecipient.update({
              where: { id: recipient.id },
              data: {
                status: "failed",
                retryCount: maxRetry,
                errorMessage: `${ORPHAN_SEND_SENTINEL} SMTP 成功後 DB 反映失敗による重複送信ブロック`,
                sentAt: new Date(),
              },
            });
            failedCount++;
          } catch (secondError: unknown) {
            console.error(
              `${LOG_TAG} CRITICAL — recipient ${recipient.id} orphan 차단 2차 실패. pending 잔존 시 다음 cycle 에서 재발송 위험 (운영자 수동 개입 필요).`,
              secondError,
            );
          }
          // 2차 DB 실패 여부와 무관하게 inner-while 종료 (성공한 SMTP 의 중복 발송 절대 차단).
          // pending 잔존 시 다음 cycle 에서 운영자 수동 개입 + CRITICAL 로그가 트리거.
          resolved = true;
          break;
        }
        resolved = true;
      }
    }

    // 하트비트 — 마지막 갱신 이후 HEARTBEAT_INTERVAL_MS 경과 시 mass_mail.updatedAt touch.
    // 시간 기반이라 소규모 발송(<50건)에서도 좀비 감지 오판정을 확실히 방지.
    // updatedAt 을 명시적으로 세팅 — MariaDB 는 컬럼 값 변화가 없으면 ON UPDATE
    // CURRENT_TIMESTAMP 트리거를 스킵하므로, increment:0 같은 no-op 가 아니라 직접 갱신.
    if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatAt = Date.now();
      try {
        await prisma.massMail.updateMany({
          where: { id: massMailId, status: "sending" },
          data: { updatedAt: new Date() },
        });
      } catch (hbError: unknown) {
        console.warn(`${LOG_TAG} heartbeat 갱신 실패 — massMailId: ${massMailId}`, hbError);
      }
    }

    if (throttleMs > 0) await sleep(throttleMs);
  }

  // 집계 컬럼 갱신 — 좀비 오판정으로 send_failed 된 row 에는 증분하지 않음 (I2 counter drift 방지)
  if (successCount > 0 || failedCount > 0) {
    const aggResult = await prisma.massMail.updateMany({
      where: { id: massMailId, status: { in: ["sending", "sent"] } },
      data: {
        sentSuccess: { increment: successCount },
        sentFailed: { increment: failedCount },
      },
    });
    if (aggResult.count === 0) {
      console.error(
        `${LOG_TAG} 집계 컬럼 갱신 실패 (count=0) — massMailId: ${massMailId} 가 sending/sent 아님. counter drift 가능 (success: ${successCount}, failed: ${failedCount}).`,
      );
    }
  }

  console.log(
    `${LOG_TAG} 발송 루프 종료 — massMailId: ${massMailId}, 성공: ${successCount}건, 실패: ${failedCount}건`,
  );

  // 루프 완료 후 여전히 처리 가능한 pending(retry_count < max) 이 남아있으면 전체 장애 간주
  // 정상 케이스엔 모두 sent 또는 failed 로 결판났어야 함 — pending 잔존은 DB/네트워크 장애 신호
  const remaining = await prisma.massMailRecipient.count({
    where: { massMailId, status: "pending", retryCount: { lt: maxRetry } },
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

  // 외부 try — runWithInFlightGuard 자체 throw / 미예측 예외에 대한 마지막 안전망.
  // 호출자(API route) 는 fire-and-forget 으로 호출 후 200 을 즉시 응답하므로,
  // 여기서 throw 가 새어나가면 mass_mail 이 pending 잔존 + 운영자 인지 채널 0.
  // 이중 보호: 1) 내부 try/catch 가 markSendFailed 로 status 전이 / 2) 외부 catch 가 markSendFailed 재호출 + CRITICAL 로그.
  // 자가복구 fallback: 외부 catch 가 markSendFailed 마저 실패해도 auto-retry-batch 의 좀비 감지가 zombieThresholdMs 후 send_failed 승격.
  try {
    await runWithInFlightGuard(massMailId, async () => {
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
    });
  } catch (outerError: unknown) {
    console.error(
      `${LOG_TAG} CRITICAL — processMassMailSend 외부 안전망 발동 (runWithInFlightGuard 자체 throw). massMailId: ${massMailId}`,
      outerError,
    );
    // 마지막 best-effort markSendFailed — 이 호출도 실패 시 좀비 감지가 처리.
    await markSendFailed(massMailId, outerError).catch((e: unknown) => {
      console.error(
        `${LOG_TAG} CRITICAL — 외부 안전망 markSendFailed 도 실패. 좀비 감지에 의존. massMailId: ${massMailId}`,
        e,
      );
    });
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

  // processMassMailSend 와 동일한 외부 안전망 — 상세 주석은 그쪽 참조.
  try {
    await runWithInFlightGuard(massMailId, async () => {
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
    });
  } catch (outerError: unknown) {
    console.error(
      `${LOG_TAG} CRITICAL — processMassMailRetry 외부 안전망 발동. massMailId: ${massMailId}`,
      outerError,
    );
    await markSendFailed(massMailId, outerError).catch((e: unknown) => {
      console.error(
        `${LOG_TAG} CRITICAL — 외부 안전망 markSendFailed 도 실패. 좀비 감지에 의존. massMailId: ${massMailId}`,
        e,
      );
    });
  }
}

/**
 * 이메일 수집 + 수신자 bulk INSERT + sent_total 갱신 (status 전이 포함).
 *
 * @param massMailId  대상 메일 ID
 * @param fromStatus  낙관적 락 조건 — 현재 status. "pending"(POST/PUT 경로) 또는 "sending"(retry 복구 경로)
 * @returns 수집된 수신자 건수. 0 반환 시 status="sent" + sentTotal=0 으로 조기 종료된 상태
 */
export async function collectAndQueueRecipients(
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

/**
 * 모든 recipients 가 종결 (sent 또는 failed) 되면 mass_mail.status='sent' 로 자동 전이.
 *
 * 핵심 불변량 #3 보장: `mass_mail.status === 'sent' ⇔ 모든 recipients ∈ {sent, failed}`
 *
 * 자동 배치(auto-retry-batch.ts) 가 매 cycle 마다 호출. 낙관적 락으로 외부 변경 보호.
 *
 * @returns true = 전이 발생, false = 아직 pending recipient 잔존 또는 외부 status 변경
 */
export async function maybePromoteToSent(massMailId: number): Promise<boolean> {
  const stillPending = await prisma.massMailRecipient.count({
    where: { massMailId, status: "pending" },
  });
  if (stillPending > 0) {
    console.log(
      `${LOG_TAG} maybePromoteToSent skip — massMailId=${massMailId}: pending ${stillPending}건 잔존`,
    );
    return false;
  }

  // Vacuous truth 방어: recipients 0 건 + sentTotal 0 인 mass_mail 은 발송이 시작도 안 된
  // 상태 (수집 실패 직전) 이므로 sent 로 전이하지 않음. collectAndQueueRecipients 의
  // 0 건 분기에서만 sentTotal=0 + status='sent' 정합 전이를 허용 (그 경로는 단일 트랜잭션).
  const settledCount = await prisma.massMailRecipient.count({
    where: { massMailId, status: { in: ["sent", "failed"] } },
  });
  if (settledCount === 0) {
    console.warn(
      `${LOG_TAG} maybePromoteToSent skip — massMailId=${massMailId}: settled recipient 0건 (vacuous sent 차단). 수집 실패 또는 상태 정합 이상 가능.`,
    );
    return false;
  }

  // sentAt 보존 — 2-step updateMany 로 TOCTOU race 없이 원자적 처리.
  // 이미 세팅된 행은 status 만, 아직 null 인 행만 새 시각 세팅. where 절에 sentAt 조건을
  // 포함해 findUnique-then-updateMany 의 read-after-write skew 를 제거.
  // sentTotal>0 조건으로 vacuous 전이 추가 차단 (수집 실패 후 외부 강제 sentTotal 변조 방어).
  const keepSentAt = await prisma.massMail.updateMany({
    where: {
      id: massMailId,
      status: { in: ["pending", "sending"] },
      sentAt: { not: null },
      sentTotal: { gt: 0 },
    },
    data: { status: "sent" },
  });
  const seedSentAt = await prisma.massMail.updateMany({
    where: {
      id: massMailId,
      status: { in: ["pending", "sending"] },
      sentAt: null,
      sentTotal: { gt: 0 },
    },
    data: { status: "sent", sentAt: new Date() },
  });
  const promoted = keepSentAt.count + seedSentAt.count;
  if (promoted > 0) {
    console.log(`${LOG_TAG} maybePromoteToSent — massMailId=${massMailId}: 모든 recipients 종결, status='sent' 전이`);
  } else {
    const current = await prisma.massMail.findUnique({
      where: { id: massMailId },
      select: { status: true },
    });
    console.warn(
      `${LOG_TAG} maybePromoteToSent count=0 — massMailId=${massMailId}: pending/sending 아님 (현재 status=${current?.status ?? "unknown"}, 외부 변경 가능성)`,
    );
  }
  return promoted > 0;
}

