import type { Prisma } from "@/generated/prisma/client";

/**
 * 대량메일 목록의 「配信日」 기간 검색·정렬 기준일.
 *
 * ⚠️ 검색·정렬 전용이다. 화면 표시는 바꾸지 않는다 (2026-11-16 사용자 지시).
 *   - 목록 「配信日」 열: 실제 발송일(`sentAt`)만, 없으면 「—」 (설계서 「임시저장인 경우, 발송일 미표시」)
 *   - 상세·수정 「配信日」 칸: 발송일, 없으면 등록일시 (설계서 등록화면 ③ 「등록 시 등록일시 표시」)
 *
 * 화면설계서(대량메일발송 목록, v1.0_confirmed ~ v2.3)는 기간 검색·정렬을 「발송일」로 정했다.
 * 발송일이 없는 메일은 값 기준으로 아래 순서로 대신한다 (2026-11-16 확정):
 *
 *   1. `sentAt` 이 있으면 `sentAt` (발송일)
 *   2. 없고 `scheduledSendAt` 이 있으면 `scheduledSendAt` (예약일)
 *   3. 둘 다 없으면 `createdAt` (등록일)
 *
 * 근거·결정 이력: `docs/01-plan/features/mass-mail-date-search.plan.md`
 */

type DeliveryDateSource = {
  sentAt: Date | null;
  scheduledSendAt: Date | null;
  createdAt: Date;
};

export function resolveDeliveryAt(mail: DeliveryDateSource): Date {
  return mail.sentAt ?? mail.scheduledSendAt ?? mail.createdAt;
}

/** `YYYY-MM-DD`(JST) 기간 → 配信日 기준 검색 조건. 둘 다 없으면 null. */
export function buildDeliveryDateWhere(
  startDate: string | undefined,
  endDate: string | undefined,
): Prisma.MassMailWhereInput | null {
  if (!startDate && !endDate) return null;

  const range: { gte?: Date; lte?: Date } = {};
  if (startDate) range.gte = new Date(`${startDate}T00:00:00+09:00`);
  if (endDate) range.lte = new Date(`${endDate}T23:59:59.999+09:00`);

  // resolveDeliveryAt 과 같은 분기 — 정렬 순서와 검색 결과의 기준일을 맞춘다.
  return {
    OR: [
      { sentAt: { not: null, ...range } },
      { sentAt: null, scheduledSendAt: { not: null, ...range } },
      { sentAt: null, scheduledSendAt: null, createdAt: range },
    ],
  };
}
