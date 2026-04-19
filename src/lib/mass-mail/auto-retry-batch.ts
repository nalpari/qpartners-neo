/**
 * 대량메일 자동 재시도 배치 (3분 cron)
 *
 * Plan v0.4 / Design v0.3 §4.6 — 3분 cron 자동 복구.
 *
 * **목적**
 *   - 좀비 감지: status='sending' 인 채로 zombieThresholdMs 경과한 mass_mail → send_failed 자동 승격
 *   - 자동 재시도: pending recipient (retry_count < max) 가 있는 mass_mail 에 sendLoop 실행
 *   - 수집 복구: recipients 가 0건인 pending mass_mail → collectAndQueueRecipients 재호출
 *   - status 자동 전이: 모든 recipients 가 종결되면 mass_mail.status='sent'
 *
 * **동작 모델**
 *   - Next.js 기동 시 `instrumentation.ts:register()` 가 startAutoRetryBatch() 호출
 *   - setInterval 로 BATCH_INTERVAL_MS (기본 3분) 마다 runBatchOnce() 실행
 *   - PM2 single instance 가정 — 인스턴스 다중화 시 분산 락 필요 (Design §4.6.5)
 *
 * **안전장치**
 *   - isRunning 플래그로 cycle 중첩 방지 (직전 cycle 가 아직 실행 중이면 skip)
 *   - 한 mass_mail 처리 실패가 batch 전체를 죽이지 않도록 try/catch 분리
 *   - batchIntervalMs=0 인 경우 배치 비활성 (테스트/개발 환경용)
 */

import { MASS_MAIL_DEFAULTS } from "@/lib/config";
import {
  collectAndQueueRecipients,
  maybePromoteToSent,
  sendLoop,
} from "@/lib/mass-mail/send-processor";
import { prisma } from "@/lib/prisma";

const LOG_TAG = "[mass-mail/auto-retry-batch]";

let batchTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 서버 기동 시 1회 호출 — setInterval 등록.
 * 중복 호출 시 무시 (idempotent).
 */
export function startAutoRetryBatch(): void {
  if (batchTimer) {
    console.warn(`${LOG_TAG} 이미 등록된 배치 — 중복 시작 시도 무시`);
    return;
  }

  const intervalMs = MASS_MAIL_DEFAULTS.batchIntervalMs;
  if (intervalMs <= 0) {
    console.log(`${LOG_TAG} batchIntervalMs=${intervalMs} → 배치 비활성 (개발/테스트 환경 추정)`);
    return;
  }

  console.log(`${LOG_TAG} 자동 재시도 배치 등록 — interval=${intervalMs}ms (${Math.round(intervalMs / 1000)}초)`);
  batchTimer = setInterval(() => {
    void runBatchOnce();
  }, intervalMs);
}

/**
 * 테스트/종료 시 배치 해제.
 */
export function stopAutoRetryBatch(): void {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
    console.log(`${LOG_TAG} 자동 재시도 배치 해제`);
  }
}

/**
 * 배치 1 cycle — 외부에서도 호출 가능 (수동 트리거 / 테스트용).
 */
export async function runBatchOnce(): Promise<void> {
  if (isRunning) {
    console.warn(`${LOG_TAG} 직전 cycle 가 아직 실행 중 — 이번 cycle skip`);
    return;
  }
  isRunning = true;
  const startedAt = Date.now();

  try {
    // 1. 좀비 감지: sending + updated_at < NOW - zombieThreshold → send_failed 자동 승격
    const zombieCutoff = new Date(Date.now() - MASS_MAIL_DEFAULTS.zombieThresholdMs);
    const zombieResult = await prisma.massMail.updateMany({
      where: { status: "sending", updatedAt: { lt: zombieCutoff } },
      data: { status: "send_failed" },
    });
    if (zombieResult.count > 0) {
      console.warn(
        `${LOG_TAG} 좀비 감지 — ${zombieResult.count}건 sending → send_failed 자동 승격 (threshold=${MASS_MAIL_DEFAULTS.zombieThresholdMs}ms)`,
      );
    }

    // 2. 처리 대상 SELECT — pending/sending 상태의 mass_mail
    //    (send_failed 는 운영자 [再送信] 수동 영역으로 둠 — Plan §3.3 3단계)
    const targets = await prisma.massMail.findMany({
      where: { status: { in: ["pending", "sending"] } },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    });

    if (targets.length === 0) {
      console.log(`${LOG_TAG} 처리 대상 없음 — cycle 종료 (소요 ${Date.now() - startedAt}ms)`);
      return;
    }

    console.log(`${LOG_TAG} cycle 시작 — 대상 ${targets.length}건`);

    let processedCount = 0;
    for (const mail of targets) {
      try {
        // 2-a. recipients 가 0건이면 수집부터 (수집 단계 실패 복구)
        const existingCount = await prisma.massMailRecipient.count({
          where: { massMailId: mail.id },
        });
        if (existingCount === 0) {
          console.log(`${LOG_TAG} mass_mail ${mail.id}: recipients 0건 → 수집 재시도 (status=${mail.status})`);
          await collectAndQueueRecipients(mail.id, mail.status as "pending" | "sending");
        }

        // 2-b. pending recipient (retry 여력 있음) 이 있으면 sendLoop
        const pendingCount = await prisma.massMailRecipient.count({
          where: {
            massMailId: mail.id,
            status: "pending",
            retryCount: { lt: MASS_MAIL_DEFAULTS.recipientMaxRetry },
          },
        });
        if (pendingCount > 0) {
          console.log(`${LOG_TAG} mass_mail ${mail.id}: pending ${pendingCount}건 → sendLoop`);
          await sendLoop(mail.id, MASS_MAIL_DEFAULTS.throttleMs);
        }

        // 2-c. mass_mail.status 자동 갱신 — 모든 recipients 가 sent/failed 면 sent
        await maybePromoteToSent(mail.id);
        processedCount++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_TAG} mass_mail ${mail.id} 처리 실패 — 다음 mail 로 진행. error: ${message}`);
        // 한 건 실패가 batch 전체를 죽이지 않도록 catch 후 continue
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`${LOG_TAG} cycle 완료 — 처리: ${processedCount}/${targets.length}건, 소요: ${elapsed}ms`);
  } catch (error: unknown) {
    console.error(`${LOG_TAG} cycle 전체 실패:`, error);
  } finally {
    isRunning = false;
  }
}
