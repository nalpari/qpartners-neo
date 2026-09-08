import { FIVE_DAYS_MS } from "@/lib/schemas/common";

/** 뱃지 판정에 필요한 게시대상 최소 형태 (endAt 은 판정에 쓰지 않음) */
type TargetLike = { roleCode: string | null; startAt: Date | null };

/**
 * 뱃지 기준일(= 공개일) 산출 — 등록일(createdAt) 이 아니다.
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
 * NEW / UPDATE 뱃지 판정 — 두 뱃지를 한 곳에서 함께 낸다.
 *
 * **공개일 도래 전에는 어떤 뱃지도 붙지 않는다.**
 * 사내 목록은 게시기간(publication window)을 의도적으로 미적용해 공개 예정 건도 함께
 * 조회되는데, 이 구간의 콘텐츠는 아직 아무에게도 공개된 적이 없다. 여기서
 * `updatedAt` 만 보고 UPDATE 를 붙이면 "공개도 안 된 글이 갱신됨" 으로 보인다
 * (예: 오늘 25일 / 가장 빠른 공개일 27일 → 25·26일엔 NEW 도 UPDATE 도 없어야 함).
 * 그래서 두 뱃지 모두 공개일 도래를 전제로 둔다.
 *
 * 공개 이후에는 NEW 는 공개일 기준 5일, UPDATE 는 수정일 기준 5일이다.
 *
 * **NEW 가 붙으면 UPDATE 는 붙지 않는다.** 등록 직후 수정하면 두 조건이 동시에 참이 되는데,
 * 우선순위는 항상 NEW 다. 이 규칙을 화면마다 `!isNew && …` 로 반복하면 새 화면에서
 * 빠뜨리기 쉬우므로 서버에서 한 번에 정리해 내려보낸다 — 즉 `isUpdated` 는
 * "수정된 지 5일 이내" 가 아니라 **"UPDATE 뱃지를 붙여야 하는가"** 를 뜻한다.
 */
export function resolveBadgeFlags(
  content: { publishedAt: Date | null; createdAt: Date; updatedAt: Date },
  targets: readonly TargetLike[],
  viewer: { internal: boolean; roleCode: string | null },
  nowMs: number,
): { isNew: boolean; isUpdated: boolean } {
  const sinceMs = resolvePublishedSince(content, targets, viewer).getTime();

  // 공개 전 — 관리자에게만 보이는 구간. 뱃지 없음.
  if (nowMs < sinceMs) return { isNew: false, isUpdated: false };

  const isNew = nowMs - sinceMs < FIVE_DAYS_MS;

  return {
    isNew,
    // NEW 우선 — 동시에 참이면 UPDATE 를 내리지 않는다.
    isUpdated: !isNew && nowMs - content.updatedAt.getTime() < FIVE_DAYS_MS,
  };
}
