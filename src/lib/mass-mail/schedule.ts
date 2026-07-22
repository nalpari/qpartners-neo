/**
 * 대량메일 발송 스케줄 파생.
 *
 * 폼 입력(status: draft|pending, scheduledSendAt?)을 DB 저장 status/scheduledSendAt 로 변환.
 * POST(등록)·PUT(수정) 라우트가 공유해 즉시/예약/초안 파생 규칙의 drift 를 방지.
 *
 * 규칙:
 * - draft: 저장만. scheduledSendAt 제공값 보존(없으면 null), 트리거 안 함.
 * - pending + scheduledSendAt(미래): 예약 → status='scheduled', 트리거 안 함(배치가 도래 시 발송).
 * - pending + scheduledSendAt(과거/현재): 예약 의도이나 무효 → PAST_SCHEDULE(라우트가 create 400 / edit 409).
 * - pending + scheduledSendAt 없음: 즉시발송 → status='pending', scheduledSendAt=now, 트리거.
 */

/** 저장 결과 status (POST/PUT 이 파생하는 값 — 전송/발송 트리거 대상만). */
export type SavedStatus = "draft" | "pending" | "scheduled";

/** 저장 결과 status 별 유저 대면 메시지 (일본어). POST/PUT 공유. */
export const STATUS_SAVE_MESSAGE: Record<SavedStatus, string> = {
  pending: "メール送信を受け付けました。",
  scheduled: "メールを予約しました。",
  draft: "下書きとして保存しました。",
};

export type ResolvedSchedule =
  | {
      ok: true;
      /** DB 저장 status */
      status: SavedStatus;
      /** DB 저장 scheduledSendAt (즉시=now, 예약=지정값, 초안=지정값 or null) */
      scheduledSendAt: Date | null;
      /** true 면 저장 후 processMassMailSend fire-and-forget 트리거 */
      triggerSend: boolean;
    }
  | { ok: false; reason: "PAST_SCHEDULE" };

export function resolveSendSchedule(
  inputStatus: "draft" | "pending",
  scheduledSendAt: Date | undefined,
  now: Date = new Date(),
): ResolvedSchedule {
  if (inputStatus === "draft") {
    return { ok: true, status: "draft", scheduledSendAt: scheduledSendAt ?? null, triggerSend: false };
  }

  // pending (登録)
  if (scheduledSendAt) {
    if (scheduledSendAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "PAST_SCHEDULE" };
    }
    return { ok: true, status: "scheduled", scheduledSendAt, triggerSend: false };
  }

  // 즉시발송 — scheduledSendAt 미전송. 저장 시각을 기록해 모든 메일이 예정일시를 갖게 함.
  return { ok: true, status: "pending", scheduledSendAt: now, triggerSend: true };
}
