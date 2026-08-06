/**
 * POST /api/batch/mass-mail — 대량메일 자동 재시도 배치 1 cycle 트리거
 *
 * 외부 스케줄러(cron 등)가 주기적으로 호출한다. 프로세스 내 setInterval 을 대체한 라우트 —
 * 운영 2 인스턴스가 각자 타이머를 돌려 같은 mass_mail 을 이중 발송하던 문제를 해소하기 위해
 * "주기"는 외부 스케줄러가 소유하고, "인스턴스 간 상호배제"는 DB 리스 락이 담당한다.
 *
 * 인증: `Authorization: Bearer <BATCH_API_TOKEN>` — 외부 스케줄러는 쿠키 세션을 가질 수 없으므로
 * 공유 시크릿 방식. middleware PUBLIC_PATHS 에 등록되어 있고 검증은 이 핸들러가 직접 수행한다.
 *
 * 응답: 실행을 시작하면 202, 다른 인스턴스가 이미 실행 중이면 200(skipped=true).
 * cycle 은 백그라운드에서 진행되므로 처리 결과는 응답에 담기지 않는다 — 결과는 서버 로그,
 * 반복 실패는 `/api/health` 503 으로 확인한다.
 */

import { createHash, timingSafeEqual } from "crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getBatchApiToken, MASS_MAIL_DEFAULTS } from "@/lib/config";
import { ConfigError } from "@/lib/errors";
import { runBatchOnce } from "@/lib/mass-mail/auto-retry-batch";
import {
  acquireBatchLock,
  MASS_MAIL_LOCK_NAME,
  releaseBatchLock,
  startLeaseRenewal,
} from "@/lib/mass-mail/batch-lock";

// setInterval(리스 갱신) / nodemailer / prisma adapter 모두 Node.js runtime 전용.
export const runtime = "nodejs";

const LOG_TAG = "[POST /api/batch/mass-mail]";

/**
 * Bearer 토큰 검증. 길이 노출을 막기 위해 양쪽을 SHA-256 다이제스트로 고정 길이화한 뒤
 * timingSafeEqual 로 비교 (길이가 다르면 timingSafeEqual 자체가 throw 하므로 해시 경유가 필수).
 */
function isAuthorized(authHeader: string | null, expected: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length).trim();
  if (provided.length === 0) return false;

  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function POST(request: NextRequest) {
  try {
    let expectedToken: string;
    try {
      expectedToken = getBatchApiToken();
    } catch (error: unknown) {
      if (error instanceof ConfigError) {
        // fail-closed — 토큰 미설정 상태에서 배치를 무인증으로 열지 않는다.
        console.error(`${LOG_TAG} 설정 에러:`, error.message);
        return NextResponse.json(
          { error: "サーバー設定エラーが発生しました" },
          { status: 500 },
        );
      }
      throw error;
    }

    if (!isAuthorized(request.headers.get("authorization"), expectedToken)) {
      console.warn(`${LOG_TAG} 인증 실패 — 토큰 불일치 또는 누락`);
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const leaseMs = MASS_MAIL_DEFAULTS.batchLeaseMs;
    const holder = await acquireBatchLock(MASS_MAIL_LOCK_NAME, leaseMs);
    if (!holder) {
      // 다른 인스턴스(또는 앞선 호출)가 실행 중 — 정상 동작이므로 스케줄러가 알람을 내지 않도록 200.
      console.log(`${LOG_TAG} 락 보유 중인 실행이 있어 skip`);
      return NextResponse.json(
        { started: false, skipped: true, reason: "locked" },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.log(`${LOG_TAG} cycle 시작 (holder=${holder}, lease=${leaseMs}ms)`);
    // 백그라운드 실행 — 응답을 즉시 반환하고 cycle 은 계속 진행한다.
    // (standalone Node 서버이므로 응답 후에도 프로세스가 promise 를 계속 실행한다)
    void (async () => {
      const stopRenewal = startLeaseRenewal(MASS_MAIL_LOCK_NAME, holder, leaseMs);
      try {
        await runBatchOnce();
      } catch (error: unknown) {
        // runBatchOnce 는 내부에서 자체 try/catch 하지만, 예기치 못한 throw 로도
        // 락 해제가 누락되지 않도록 최상위에서 한 번 더 잡는다.
        console.error(`${LOG_TAG} cycle 실행 중 예외:`, error);
      } finally {
        stopRenewal();
        await releaseBatchLock(MASS_MAIL_LOCK_NAME, holder).catch((error: unknown) => {
          // 해제 실패 시에도 리스 만료로 자동 회수된다 (최대 leaseMs 지연).
          console.error(`${LOG_TAG} 락 해제 실패 — 리스 만료로 자동 회수됨:`, error);
        });
      }
    })();

    return NextResponse.json(
      { started: true, skipped: false },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(LOG_TAG, error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
