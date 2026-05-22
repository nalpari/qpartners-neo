/**
 * 콘텐츠 작성자 본인 권한 강제 포함 (FE 우회 방어).
 *
 * 정책: 비사내 작성자가 자기 권한코드를 `targets` 에 누락한 채 저장 시,
 * 본인이 본인 콘텐츠를 목록에서 못 보는 회귀를 막기 위해 서버에서 자동 추가한다
 * (목록 GET 가 `targets.some.roleCode = user.role` 매칭).
 *
 * 적용 조건:
 * - `targets === undefined` → 기존 의도 유지 (PUT 미명시 = 변경 의도 없음). 그대로 반환.
 * - 사내 작성자(SUPER_ADMIN/ADMIN) → 본인은 `canAccessContent` fail-open 으로 항상 열람 가능, 보강 없음.
 * - 비사내 작성자 + targets 에 본인 role 이 이미 있음 → 그대로.
 * - 비사내 작성자 + targets 에 본인 role 없음 → 시작일=오늘, 종료일=미지정(상시 공개) 으로 1건 추가.
 *
 * FE 측 `ContentsFormPostTarget.forcedRoleCode` 와 같은 정책의 서버 측 단일 진실.
 */

import { isInternalUser } from "@/lib/auth";

type ContentTargetInput = {
  roleCode: string | null;
  startAt?: Date;
  endAt?: Date;
};

export function ensureAuthorTarget(
  targets: ContentTargetInput[] | undefined,
  userRole: string,
): ContentTargetInput[] | undefined {
  if (targets === undefined) return undefined;
  if (isInternalUser(userRole)) return targets;
  if (targets.some((t) => t.roleCode === userRole)) return targets;
  return [
    ...targets,
    {
      roleCode: userRole,
      startAt: new Date(),
      // endAt 미지정 = 상시 공개 (ContentTarget.endAt NULL).
    },
  ];
}
