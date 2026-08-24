import { FIVE_DAYS_MS } from "@/lib/schemas/common";

/** New 뱃지 판정에 필요한 게시대상 최소 형태 (endAt 은 판정에 쓰지 않음) */
type TargetLike = { roleCode: string | null; startAt: Date | null };

/**
 * New 뱃지 기준일(= 공개일) 산출 — 등록일(createdAt) 이 아니다.
 *
 * 운영 정책:
 * - 사내(SUPER_ADMIN/ADMIN): 게시대상 중 **가장 빠른 공개일**
 *   (권한별로 공개일이 다르므로 관리 화면에서는 최초 공개 시점을 기준으로 본다)
 * - 그 외 사용자(비로그인 포함): **자신의 권한에 해당하는 게시대상의 공개일**
 *   (roleCode 는 로그인 사용자의 권한, 비로그인은 null = 비회원 게시대상)
 *
 * `startAt = null` 은 "즉시 공개" 를 의미하므로 publishedAt(없으면 createdAt)로 대체한다.
 * 게시대상이 없는 콘텐츠(사내 전용)도 같은 폴백을 쓴다.
 *
 * ContentTarget 은 @@unique([contentId, roleCode]) 이므로 비사내 매칭은 최대 1건이다.
 */
export function resolvePublishedSince(
  content: { publishedAt: Date | null; createdAt: Date },
  targets: readonly TargetLike[],
  viewer: { internal: boolean; roleCode: string | null },
): Date {
  const fallback = content.publishedAt ?? content.createdAt;

  if (viewer.internal) {
    let earliest: Date | null = null;
    for (const t of targets) {
      const at = t.startAt ?? fallback;
      if (earliest === null || at < earliest) earliest = at;
    }
    return earliest ?? fallback;
  }

  const mine = targets.find((t) => t.roleCode === viewer.roleCode);
  return mine ? (mine.startAt ?? fallback) : fallback;
}

/**
 * 공개일 기준 New 판정 — 공개일 이후 5일간.
 * 공개 예정(공개일 > now)은 아직 New 가 아니다. 사내 목록은 publication window 를
 * 적용하지 않아 예정 건도 함께 조회되므로 하한 검사가 필요하다.
 */
export function isNewSince(publishedSince: Date, nowMs: number): boolean {
  const elapsed = nowMs - publishedSince.getTime();
  return elapsed >= 0 && elapsed < FIVE_DAYS_MS;
}
