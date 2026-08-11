/**
 * 배치 분산 락 (DB 리스 방식)
 *
 * **왜 필요한가**
 *   운영은 2 인스턴스로 기동되고, 배치는 외부 스케줄러가 `POST /api/batch/*` 를 호출해 구동된다.
 *   LB 가 호출을 인스턴스 A/B 에 번갈아 보내면 앞 실행이 끝나기 전에 다른 인스턴스에서 겹칠 수 있다.
 *   프로세스 로컬 플래그(`__massMailBatchRunning`)나 인-메모리 Set 은 인스턴스 간 중복을
 *   막지 못하므로 — 같은 mass_mail 을 두 인스턴스가 동시에 발송 = 이중 SMTP 발송 —
 *   `qp_batch_locks` 행에 대한 원자적 UPDATE 로 인스턴스 간 상호배제를 보장한다.
 *
 * **락 2종**
 *   - cycle 락 `mass-mail` — 배치 라우트가 획득. 배치 cycle 끼리 겹치지 않게.
 *   - mail 락 `mass-mail:{id}` — 발송 파이프라인(배치/수동 공통)이 획득. 배치와 관리자
 *     [発送]/[再送信] 이 같은 mass_mail 을 동시에 처리하지 않게. 두 락은 항상
 *     cycle → mail 순으로만 획득되므로 교착 없음.
 *
 * **리스 모델**
 *   - 획득: `UPDATE ... WHERE name=? AND expires_at <= NOW` — 만료(또는 해제)된 락만 탈취.
 *     단일 원자적 UPDATE 이므로 두 인스턴스가 동시에 시도해도 affected rows=1 은 한쪽뿐.
 *   - 갱신: 실행 중 `leaseMs/3` 주기로 만료 시각을 밀어 리스를 유지 (긴 cycle 대응).
 *   - 해제: 만료 시각을 현재 시각으로 되돌려 즉시 다음 호출이 획득 가능한 상태로 만든다.
 *   - 홀더 프로세스가 죽으면 해제가 실행되지 않지만, 리스가 만료되면 자동으로 회수된다
 *     (= 영구 데드락 없음). 이 회수 지연이 `MASS_MAIL_BATCH_LEASE_MS` 의 의미.
 *
 * **홀더 식별자**
 *   실행 1회당 유일한 값(UUID 포함)을 쓴다. 프로세스 단위가 아닌 실행 단위여야,
 *   리스를 잃은 직전 실행의 갱신 타이머가 새 홀더의 락을 되살리는 일이 없다.
 */

import { hostname } from "os";
import { randomUUID } from "crypto";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { prisma } from "@/lib/prisma";

const LOG_TAG = "[batch-lock]";

/** 대량메일 배치 cycle 락 이름 (cycle 단위 상호배제) */
export const MASS_MAIL_LOCK_NAME = "mass-mail";

/**
 * mass_mail 1건 단위 락 이름 (발송 파이프라인 상호배제).
 *
 * cycle 락과 별개인 이유: 배치는 cycle 락으로 서로 겹치지 않지만, 관리자 [発送]/[再送信] 은
 * 배치가 아니므로 cycle 락을 잡지 않는다. 발송 중(status='sending')인 mass_mail 도 배치의
 * 처리 대상(pending/sending)에 포함되므로, 인스턴스 A 의 수동 발송과 인스턴스 B 의 배치가
 * 같은 mass_mail 을 동시에 sendLoop 하는 경합이 남는다 — 이를 mail 단위 락으로 차단한다.
 *
 * `name` 은 VARCHAR(64) — prefix 10자 + 정수 id 라 상한에 여유가 있다.
 */
export function massMailLockName(massMailId: number): string {
  return `mass-mail:${massMailId}`;
}

/**
 * 락 획득 시도. 성공하면 홀더 식별자, 다른 인스턴스가 보유 중이면 null.
 *
 * DB 에러는 그대로 throw — 호출자가 500 으로 노출해 배치를 실행하지 않는다 (fail-closed).
 */
export async function acquireBatchLock(name: string, leaseMs: number): Promise<string | null> {
  const holder = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  // 1) 이미 행이 있는 정상 경로 — 만료된 리스만 원자적으로 탈취.
  const claimed = await prisma.batchLock.updateMany({
    where: { name, expiresAt: { lte: now } },
    data: { expiresAt, holder },
  });
  if (claimed.count > 0) return holder;

  // 2) 행이 아직 없는 최초 1회 — create 로 획득. PK 충돌은 다른 인스턴스가 동시에
  //    생성했다는 뜻이므로 "보유 중"으로 간주해 null (다음 호출에서 1)로 처리됨).
  try {
    await prisma.batchLock.create({ data: { name, expiresAt, holder } });
    return holder;
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}

/**
 * 락 해제 — 만료 시각을 현재로 되돌려 다음 호출이 즉시 획득 가능하게 한다.
 * `holder` 조건으로 본인 소유일 때만 해제 (리스가 만료돼 이미 다른 인스턴스가
 * 이어받았다면 count=0 → 새 홀더의 락을 건드리지 않는다).
 */
export async function releaseBatchLock(name: string, holder: string): Promise<void> {
  const released = await prisma.batchLock.updateMany({
    where: { name, holder },
    data: { expiresAt: new Date() },
  });
  if (released.count === 0) {
    console.warn(
      `${LOG_TAG} ${name}: 해제 대상 없음 — 실행 중 리스가 만료되어 다른 인스턴스가 이어받은 것으로 추정 (holder=${holder})`,
    );
  }
}

/**
 * 리스 자동 갱신 시작. 반환된 함수를 호출하면 갱신을 중단한다 (finally 에서 호출할 것).
 *
 * 갱신 실패(count=0)는 리스가 만료돼 다른 인스턴스가 락을 이어받았다는 뜻 —
 * 이 시점엔 중복 실행이 이미 시작됐을 수 있으므로 CRITICAL 로 남긴다.
 * (leaseMs/3 주기 갱신이 정상 동작하는 한 발생하지 않아야 하는 상황)
 */
export function startLeaseRenewal(name: string, holder: string, leaseMs: number): () => void {
  const timer = setInterval(() => {
    void prisma.batchLock
      .updateMany({
        where: { name, holder },
        data: { expiresAt: new Date(Date.now() + leaseMs) },
      })
      .then((result) => {
        if (result.count === 0) {
          clearInterval(timer);
          console.error(
            `${LOG_TAG} CRITICAL — ${name}: 리스 갱신 실패(소유권 상실). 다른 인스턴스가 같은 배치를 실행 중일 수 있음 (holder=${holder})`,
          );
        }
      })
      .catch((error: unknown) => {
        // 일시 DB 오류는 다음 주기에 재시도 — 만료 전이면 자연 복구된다.
        console.error(`${LOG_TAG} ${name}: 리스 갱신 중 DB 오류 (다음 주기 재시도):`, error);
      });
  }, Math.floor(leaseMs / 3));

  return () => clearInterval(timer);
}
