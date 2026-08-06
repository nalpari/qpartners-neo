/**
 * 대량메일 자동 재시도 배치 (외부 스케줄러 구동)
 *
 * Plan §4.6 / Design §4.6 (mass-mail-send) — 주기적 자동 복구.
 *
 * **목적**
 *   - 좀비 감지: status='sending' 인 채로 zombieThresholdMs 경과한 mass_mail → send_failed 자동 승격
 *   - 자동 재시도: pending recipient (retry_count < max) 가 있는 mass_mail 에 sendLoop 실행
 *   - 수집 복구: recipients 가 0건인 pending mass_mail → collectAndQueueRecipients 재호출
 *   - status 자동 전이: 모든 recipients 가 종결되면 mass_mail.status='sent'
 *
 * **동작 모델**
 *   - 외부 스케줄러(cron 등)가 `POST /api/batch/mass-mail` 을 주기적으로 호출 → runBatchOnce() 1회 실행
 *   - 프로세스 내 setInterval 을 쓰지 않는다 — 운영 2 인스턴스가 각자 타이머를 돌려
 *     같은 mass_mail 을 이중 발송하는 문제가 있었음. 주기 설정은 스케줄러 쪽 책임.
 *   - 인스턴스 간 중복 실행은 2단 리스 락으로 차단 (batch-lock.ts, `qp_batch_locks`)
 *     · cycle 락(`mass-mail`): 라우트가 획득 — 배치 cycle 끼리의 상호배제
 *     · mail 락(`mass-mail:{id}`): runWithMassMailLock 이 획득 — 배치와 관리자 [発送]/[再送信]
 *       사이의 상호배제 (수동 경로는 cycle 락 대상이 아니므로 mail 단위 락이 필요)
 *
 * **안전장치**
 *   - __massMailBatchRunning 플래그로 같은 프로세스 내 cycle 중첩 방지 (분산 락의 프로세스 내 보완층)
 *   - 한 mass_mail 처리 실패가 batch 전체를 죽이지 않도록 try/catch 분리
 *   - cycle 연속 실패가 BATCH_FAILURE_THRESHOLD 에 도달하면 /api/health 가 503 노출
 */

import { MASS_MAIL_DEFAULTS } from "@/lib/config";
import { massMailLockName } from "@/lib/mass-mail/batch-lock";
import { BATCH_FAILURE_THRESHOLD, batchState } from "@/lib/mass-mail/batch-state";
import {
  collectAndQueueRecipients,
  maybePromoteToSent,
  runWithMassMailLock,
  sendLoop,
} from "@/lib/mass-mail/send-processor";
import { prisma } from "@/lib/prisma";

const LOG_TAG = "[mass-mail/auto-retry-batch]";

/** 한 cycle 에서 처리할 최대 mass_mail 건수 — 백로그가 커도 cycle 시간이 폭주하지 않도록 */
const CYCLE_MAX_TARGETS = 500;

const g = batchState;

/**
 * 배치 1 cycle — `POST /api/batch/mass-mail` 이 락을 획득한 뒤 호출한다.
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
    //    발송 파이프라인 락을 보유 중인 mass_mail 은 제외 — heartbeat 가 느릴 때도
    //    in-flight 를 좀비로 오판정하지 않도록 추가 방어. 락은 DB 기반이므로
    //    다른 인스턴스에서 발송 중인 건도 정확히 식별된다 (인-메모리 Set 은 인스턴스 간 무력).
    const zombieCutoff = new Date(Date.now() - MASS_MAIL_DEFAULTS.zombieThresholdMs);
    const zombieCandidates = await prisma.massMail.findMany({
      where: { status: "sending", updatedAt: { lt: zombieCutoff } },
      select: { id: true, updatedAt: true },
    });
    const heldLocks =
      zombieCandidates.length === 0
        ? []
        : await prisma.batchLock.findMany({
            where: {
              name: { in: zombieCandidates.map((z) => massMailLockName(z.id)) },
              expiresAt: { gt: new Date() },
            },
            select: { name: true },
          });
    const heldLockNames = new Set(heldLocks.map((lock) => lock.name));
    const isInFlight = (id: number) => heldLockNames.has(massMailLockName(id));
    const inFlightIds = zombieCandidates.map((z) => z.id).filter(isInFlight);
    const realZombieIds = zombieCandidates.map((z) => z.id).filter((id) => !isInFlight(id));
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

    // 1.5. 예약 도래 처리 — scheduled + scheduledSendAt<=now → pending 전이.
    //      전이를 targets SELECT 이전에 수행해, 도래한 예약 건이 이번 cycle 의 pending 처리 루프에서
    //      바로 수집+발송되도록 한다. 낙관적 락(status='scheduled' AND scheduledSendAt<=now)으로
    //      동시 전이/외부 상태변경을 방어 — 중복 발송 없음. scheduled 는 send 트리거를 받은 적이
    //      없으므로(오직 배치가 발송) in-flight 경합 대상이 아니다.
    const dueNow = new Date();
    const dueScheduled = await prisma.massMail.findMany({
      where: { status: "scheduled", scheduledSendAt: { lte: dueNow } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: CYCLE_MAX_TARGETS,
    });
    if (dueScheduled.length === CYCLE_MAX_TARGETS) {
      // pending SELECT 상한 경고와 동일 — 같은 분 대량 예약 시 초과분이 조용히 다음 cycle 로 밀리는 것을 알린다.
      console.warn(`${LOG_TAG} 예약 도래 대상이 상한(${CYCLE_MAX_TARGETS})에 도달 — 예약 적체/발송 지연 가능`);
    }
    // 단일 bulk updateMany — 낙관적 락(status='scheduled' AND scheduledSendAt<=now)이 WHERE 에 그대로
    // 있어 SELECT 이후 상태가 바뀐 행은 매칭되지 않는다(per-row 루프와 동일 보장). 좀비 승격과 동일 idiom.
    const promotedResult = await prisma.massMail.updateMany({
      where: {
        id: { in: dueScheduled.map((d) => d.id) },
        status: "scheduled",
        scheduledSendAt: { lte: dueNow },
      },
      data: { status: "pending" },
    });
    const promotedScheduled = promotedResult.count;
    if (promotedScheduled > 0) {
      console.log(
        `${LOG_TAG} 예약 도래 — ${promotedScheduled}건 scheduled → pending 전이 (이번 cycle 발송 대상 포함)`,
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

      // runWithMassMailLock 이 mass_mail 단위 분산 락의 획득/갱신/해제를 담당.
      // 다른 경로(processMassMailSend / processMassMailRetry)가 — 다른 인스턴스에서라도 —
      // 같은 mass_mail 을 수집/발송 중이면 자동 skip
      // → 중복 SMTP 발송 + QSP 이중 호출 + 좀비 오판정 차단.
      // 락 획득 자체가 DB 오류로 실패하면 이 건만 포기하고 다음 mail 로 진행 (cycle 전체 중단 방지).
      try {
        await runWithMassMailLock(mail.id, async () => {
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
      } catch (lockError: unknown) {
        console.error(`${LOG_TAG} mass_mail ${mail.id} 락 획득/해제 실패 — 다음 mail 로 진행.`, lockError);
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`${LOG_TAG} cycle 완료 — 처리: ${processedCount}/${targets.length}건, 소요: ${elapsed}ms`);
    // 정상 cycle 1회로 연속 실패 카운터 리셋 — 일시 장애 후 자가복구 정상 인정.
    g.__massMailBatchConsecutiveFailures = 0;
  } catch (error: unknown) {
    const failures = (g.__massMailBatchConsecutiveFailures ?? 0) + 1;
    g.__massMailBatchConsecutiveFailures = failures;
    console.error(
      `${LOG_TAG} cycle 전체 실패 (${failures}/${BATCH_FAILURE_THRESHOLD}):`,
      error,
    );
    if (failures >= BATCH_FAILURE_THRESHOLD) {
      // 같은 원인이 반복 중이라고 판단 — /api/health 가 503 을 노출해 운영자가 즉시 인지.
      // 정상 cycle 1회로 카운터가 리셋되므로 원인 해소 후에는 재기동 없이 자가복구된다.
      console.error(
        `${LOG_TAG} CRITICAL — cycle 연속 실패 ${failures}회 도달. /api/health 503 으로 노출. 운영자 확인 필요.`,
      );
    }
  } finally {
    g.__massMailBatchRunning = false;
  }
}
