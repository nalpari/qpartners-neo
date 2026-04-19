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
 *   - 타이머는 globalThis 에 보관 — Next.js dev HMR 리로드 시 중복 setInterval 방지
 */

import { MASS_MAIL_DEFAULTS } from "@/lib/config";
import {
  collectAndQueueRecipients,
  inFlightMassMails,
  maybePromoteToSent,
  runWithInFlightGuard,
  sendLoop,
} from "@/lib/mass-mail/send-processor";
import { prisma } from "@/lib/prisma";

const LOG_TAG = "[mass-mail/auto-retry-batch]";

/** 한 cycle 에서 처리할 최대 mass_mail 건수 — 백로그가 커도 cycle 시간이 폭주하지 않도록 */
const CYCLE_MAX_TARGETS = 200;

// HMR dev 환경에서 모듈 재-import 시에도 단일 타이머 유지.
type BatchGlobals = {
  __massMailBatchTimer?: NodeJS.Timeout | null;
  __massMailBatchRunning?: boolean;
};
const g = globalThis as unknown as BatchGlobals;

/**
 * 서버 기동 시 1회 호출 — setInterval 등록.
 * 중복 호출 시 무시 (idempotent).
 */
export function startAutoRetryBatch(): void {
  if (g.__massMailBatchTimer) {
    console.warn(`${LOG_TAG} 이미 등록된 배치 — 중복 시작 시도 무시`);
    return;
  }

  const intervalMs = MASS_MAIL_DEFAULTS.batchIntervalMs;
  if (intervalMs <= 0) {
    console.log(`${LOG_TAG} MASS_MAIL_BATCH_INTERVAL_MS=${intervalMs} → 배치 비활성 (개발/테스트 환경 추정)`);
    return;
  }

  console.log(`${LOG_TAG} 자동 재시도 배치 등록 — interval=${intervalMs}ms (${Math.round(intervalMs / 1000)}초)`);
  g.__massMailBatchTimer = setInterval(() => {
    runBatchOnce().catch((err: unknown) => {
      console.error(`${LOG_TAG} unhandled cycle error:`, err);
    });
  }, intervalMs);
}

export function stopAutoRetryBatch(): void {
  if (g.__massMailBatchTimer) {
    clearInterval(g.__massMailBatchTimer);
    g.__massMailBatchTimer = null;
    console.log(`${LOG_TAG} 자동 재시도 배치 해제`);
  }
}

/**
 * 배치 1 cycle — 외부에서도 호출 가능 (수동 트리거 / 테스트용).
 */
export async function runBatchOnce(): Promise<void> {
  if (g.__massMailBatchRunning) {
    console.warn(`${LOG_TAG} 직전 cycle 가 아직 실행 중 — 이번 cycle skip`);
    return;
  }
  g.__massMailBatchRunning = true;
  const startedAt = Date.now();

  try {
    // 1. 좀비 감지: sending + updated_at < NOW - zombieThreshold → send_failed 자동 승격.
    //    현재 프로세스에서 sendLoop 실행 중인 mass_mail 은 제외 — heartbeat 가 느릴 때도
    //    in-flight 를 좀비로 오판정하지 않도록 인-메모리 마커로 추가 방어 (PM2 single instance 가정).
    const zombieCutoff = new Date(Date.now() - MASS_MAIL_DEFAULTS.zombieThresholdMs);
    const zombieCandidates = await prisma.massMail.findMany({
      where: { status: "sending", updatedAt: { lt: zombieCutoff } },
      select: { id: true, updatedAt: true },
    });
    const inFlightIds = zombieCandidates.filter((z) => inFlightMassMails.has(z.id)).map((z) => z.id);
    const realZombieIds = zombieCandidates
      .map((z) => z.id)
      .filter((id) => !inFlightMassMails.has(id));
    if (inFlightIds.length > 0) {
      console.log(
        `${LOG_TAG} 좀비 후보 중 in-flight ${inFlightIds.length}건 제외 — ids=[${inFlightIds.join(", ")}]`,
      );
    }
    if (realZombieIds.length > 0) {
      const zombieResult = await prisma.massMail.updateMany({
        where: { id: { in: realZombieIds }, status: "sending" },
        data: { status: "send_failed" },
      });
      console.warn(
        `${LOG_TAG} 좀비 감지 — ${zombieResult.count}건 sending → send_failed 자동 승격 (threshold=${MASS_MAIL_DEFAULTS.zombieThresholdMs}ms, ids=[${realZombieIds.join(", ")}])`,
      );
    }

    // 2. 처리 대상 SELECT — pending/sending 상태의 mass_mail
    //    (send_failed 는 운영자 [再送信] 수동 영역으로 둠 — Plan §3.3 3단계)
    const targets = await prisma.massMail.findMany({
      where: { status: { in: ["pending", "sending"] } },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
      take: CYCLE_MAX_TARGETS,
    });

    if (targets.length === 0) {
      console.log(`${LOG_TAG} 처리 대상 없음 — cycle 종료 (소요 ${Date.now() - startedAt}ms)`);
      return;
    }
    if (targets.length === CYCLE_MAX_TARGETS) {
      console.warn(`${LOG_TAG} cycle 대상이 상한(${CYCLE_MAX_TARGETS})에 도달 — 백로그 적체 가능`);
    }

    console.log(`${LOG_TAG} cycle 시작 — 대상 ${targets.length}건`);

    let processedCount = 0;
    for (const mail of targets) {
      // fromStatus 타입 가드 — `as` 캐스팅 대신 narrow 로 안전 변환.
      if (mail.status !== "pending" && mail.status !== "sending") {
        continue;
      }
      const fromStatus = mail.status;

      // runWithInFlightGuard 가 inFlightMassMails.has 체크 + add/delete 담당.
      // 다른 경로(processMassMailSend / processMassMailRetry)에서 같은 mass_mail 을
      // 수집/발송 중이면 자동으로 skip → 중복 SMTP 발송 + QSP 이중 호출 + 좀비 오판정 차단.
      await runWithInFlightGuard(mail.id, async () => {
        try {
          // 2-a. recipients 가 0건이면 수집부터 (수집 단계 실패 복구)
          const existingCount = await prisma.massMailRecipient.count({
            where: { massMailId: mail.id },
          });
          if (existingCount === 0) {
            console.log(`${LOG_TAG} mass_mail ${mail.id}: recipients 0건 → 수집 재시도 (status=${fromStatus})`);
            await collectAndQueueRecipients(mail.id, fromStatus);
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
          console.error(`${LOG_TAG} mass_mail ${mail.id} 처리 실패 — 다음 mail 로 진행.`, error);
        }
      });
    }

    const elapsed = Date.now() - startedAt;
    console.log(`${LOG_TAG} cycle 완료 — 처리: ${processedCount}/${targets.length}건, 소요: ${elapsed}ms`);
  } catch (error: unknown) {
    console.error(`${LOG_TAG} cycle 전체 실패:`, error);
  } finally {
    g.__massMailBatchRunning = false;
  }
}
