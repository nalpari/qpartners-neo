"use client";

import { Checkbox, DatePicker } from "@/components/common";
import { useTargetLabels, type TargetRoleOption } from "@/hooks/use-target-labels";

/**
 * 콘텐츠 등록 폼 게시대상 선택 (Target Dynamic from Role 후).
 *
 * - 6 기본 권한 + 운영자 정의 추가 권한 + 비회원 sentinel 모두 동적 노출.
 * - useTargetLabels.allOptions 가 6 기본 → 추가 권한 → 비회원 순으로 정렬됨.
 * - 비활성 권한은 새로 체크 불가 (이미 체크된 행만 해제 가능).
 * - forcedRoleCode (비관리자 작성자의 본인 권한코드) 행은 자동 체크 + 해제 불가.
 *   본인이 작성한 콘텐츠가 본인 목록에서 사라지는 회귀 방지 (목록 GET 가 roleCode=user.role 매칭).
 */

interface PostTargetItem {
  /** roleCode — null = 비회원 */
  roleCode: string | null;
  checked: boolean;
  startDate: Date | null;
  endDate: Date | null;
}

export interface PostTargetState {
  selectAll: boolean;
  allStartDate: Date | null;
  allEndDate: Date | null;
  targets: PostTargetItem[];
}

interface ContentsFormPostTargetProps {
  postTargets: PostTargetState;
  onPostTargetsChange: (targets: PostTargetState) => void;
  /** 비관리자 작성자의 본인 권한코드 — null = 강제 없음(사내회원/미로그인) */
  forcedRoleCode?: string | null;
}

/**
 * 폼 마운트 시 초기 PostTargetState 빌더 — allOptions 와 existingTargets 결합.
 *
 * - allOptions(`useTargetLabels.allOptions`) 의 모든 권한을 unchecked 행으로 채운다.
 * - existingTargets(편집모드 진입) 가 있으면 매칭되는 행을 checked + 기간으로 덮어쓴다.
 * - existingTargets 의 roleCode 가 현재 allOptions 에 없으면(비활성 권한) 행을 추가해
 *   체크 해제만 가능하도록 노출한다 (rendering 측은 `available || checked` 가드).
 */
export function buildInitialPostTargetsState(
  allOptions: readonly TargetRoleOption[],
  existingTargets?: readonly {
    roleCode: string | null;
    startAt: string | null;
    endAt: string | null;
  }[],
  forcedRoleCode?: string | null,
): PostTargetState {
  const today = new Date();
  const defaultEnd = new Date("2999-12-31");

  const existingMap = new Map(
    (existingTargets ?? []).map((t) => [t.roleCode, t] as const),
  );

  const items: PostTargetItem[] = allOptions.map((opt) => {
    const found = existingMap.get(opt.roleCode);
    const isForced =
      forcedRoleCode != null && opt.roleCode === forcedRoleCode;
    if (found) {
      return {
        roleCode: opt.roleCode,
        checked: true,
        startDate: found.startAt ? new Date(found.startAt) : null,
        endDate: found.endAt ? new Date(found.endAt) : null,
      };
    }
    // forcedRoleCode 행은 신규 등록 시점부터 체크 + 기본 기간(오늘~2999) 부여
    return {
      roleCode: opt.roleCode,
      checked: isForced,
      startDate: new Date(today),
      endDate: new Date(defaultEnd),
    };
  });

  // allOptions 에 없는 existingTarget(비활성 권한 등) 도 보존 — 사용자 해제 가능.
  const optionRoleCodes = new Set(allOptions.map((o) => o.roleCode));
  for (const t of existingTargets ?? []) {
    if (optionRoleCodes.has(t.roleCode)) continue;
    items.push({
      roleCode: t.roleCode,
      checked: true,
      startDate: t.startAt ? new Date(t.startAt) : null,
      endDate: t.endAt ? new Date(t.endAt) : null,
    });
  }

  // forcedRoleCode 가 allOptions 에도 existingTargets 에도 없는 극단 케이스 방어 —
  // 비활성화된 본인 권한으로 폼 진입했을 때(현실에선 매트릭스 가드가 차단하지만 fail-closed).
  if (forcedRoleCode != null && !items.some((i) => i.roleCode === forcedRoleCode)) {
    items.push({
      roleCode: forcedRoleCode,
      checked: true,
      startDate: new Date(today),
      endDate: new Date(defaultEnd),
    });
  }

  return {
    selectAll: items.length > 0 && items.every((i) => i.checked),
    allStartDate: today,
    allEndDate: defaultEnd,
    targets: items,
  };
}

export function ContentsFormPostTarget({
  postTargets,
  onPostTargetsChange,
  forcedRoleCode = null,
}: ContentsFormPostTargetProps) {
  // contentTargetOptions: SUPER_ADMIN/ADMIN 제외 — 사내회원은 게시대상과 무관하게 항상 조회 가능.
  // 편집 모드에서 기존 데이터에 SUPER_ADMIN/ADMIN 타깃이 있으면 buildInitialPostTargetsState 의
  // "비활성/외부 권한 보존" 분기로 행이 유지되어 해제만 가능하게 노출된다.
  const { contentTargetOptions: allOptions, isLoading } = useTargetLabels();

  const isForcedRow = (roleCode: string | null) =>
    forcedRoleCode != null && roleCode === forcedRoleCode;

  const handleSelectAll = (checked: boolean) => {
    onPostTargetsChange({
      ...postTargets,
      selectAll: checked,
      targets: postTargets.targets.map((t) => {
        // forcedRoleCode 행은 전체해제에도 항상 체크 유지
        if (isForcedRow(t.roleCode)) return { ...t, checked: true };
        const opt = allOptions.find((o) => o.roleCode === t.roleCode);
        const available = opt?.isActive ?? false;
        if (!checked) return { ...t, checked: false };
        return { ...t, checked: available ? true : t.checked };
      }),
    });
  };

  const handleTargetCheck = (roleCode: string | null, checked: boolean) => {
    // forcedRoleCode 행 해제 시도는 무시
    if (isForcedRow(roleCode) && !checked) return;
    const newTargets = postTargets.targets.map((t) =>
      t.roleCode === roleCode ? { ...t, checked } : t,
    );
    const allChecked = newTargets.every((t) => t.checked);
    onPostTargetsChange({
      ...postTargets,
      selectAll: allChecked,
      targets: newTargets,
    });
  };

  const handleTargetDate = (
    roleCode: string | null,
    field: "startDate" | "endDate",
    date: Date | null,
  ) => {
    onPostTargetsChange({
      ...postTargets,
      targets: postTargets.targets.map((t) =>
        t.roleCode === roleCode ? { ...t, [field]: date } : t,
      ),
    });
  };

  const handleApplyAll = () => {
    onPostTargetsChange({
      ...postTargets,
      targets: postTargets.targets.map((t) =>
        t.checked
          ? {
              ...t,
              startDate: postTargets.allStartDate
                ? new Date(postTargets.allStartDate)
                : t.startDate,
              endDate: postTargets.allEndDate
                ? new Date(postTargets.allEndDate)
                : t.endDate,
            }
          : t,
      ),
    });
  };

  const getTarget = (roleCode: string | null) =>
    postTargets.targets.find((t) => t.roleCode === roleCode);

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-[14px] pt-[34px] pb-6 px-6 w-[1440px]">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        投稿対象
      </h2>

      {/* 헤더 바: 전체선택 + 기간 + 적용 + 안내 */}
      <div className="flex items-center gap-[18px] bg-[#F7F9FB] rounded-[6px] px-4 py-[14px]">
        <Checkbox
          checked={postTargets.selectAll}
          onChange={handleSelectAll}
          label="全選択/解除"
          disabled={isLoading}
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <DatePicker
              value={postTargets.allStartDate}
              onChange={(date) =>
                onPostTargetsChange({ ...postTargets, allStartDate: date })
              }
              className="w-[200px]"
            />
            <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">
              ~
            </span>
            <DatePicker
              value={postTargets.allEndDate}
              onChange={(date) =>
                onPostTargetsChange({ ...postTargets, allEndDate: date })
              }
              className="w-[200px]"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyAll}
            className="inline-flex items-center justify-center h-[42px] w-[97px] bg-[#506273] border border-[#455768] rounded-[4px] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-white text-center whitespace-nowrap transition-colors duration-150 hover:bg-[#3d4f5f]"
          >
            選択の適用
          </button>
        </div>
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] whitespace-nowrap">
          ※社内会員（スーパー管理者／管理者）は掲示対象に関係なく常に照会可能
          {forcedRoleCode != null
            ? "（本人の権限は照会のため必須付与されます）"
            : ""}
        </p>
      </div>

      {/* 대상 옵션 — 동적 grid (3열 자동 wrapping) */}
      <div className="grid grid-cols-3 gap-1">
        {allOptions.map((opt) => {
          const target = getTarget(opt.roleCode);
          const available = opt.isActive;
          // 비활성 권한은 미표시. 단 기존 데이터에서 체크된 경우 해제 가능하도록 노출.
          const shouldRender = available || (target?.checked ?? false);

          if (!shouldRender) return null;

          const key = opt.roleCode ?? "__NON_MEMBER__";

          return (
            <div key={key} className="flex gap-1 h-[58px]">
              <div
                className={`w-[120px] shrink-0 flex items-center pl-4 pr-2 rounded-[6px] border border-[#EAF0F6] ${
                  shouldRender ? "bg-[#F7F9FB]" : "bg-white"
                }`}
              >
                <span
                  className={`font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] whitespace-nowrap truncate ${
                    available ? "text-[#45576F]" : "text-[#A0A8B0]"
                  }`}
                >
                  {opt.label}
                </span>
              </div>
              <div className="flex-1 flex items-center gap-2 bg-white border border-[#EAF0F6] rounded-[6px] p-2">
                {target && (
                  <>
                    <Checkbox
                      checked={target.checked}
                      onChange={(checked) => handleTargetCheck(opt.roleCode, checked)}
                      disabled={(!available && !target.checked) || isForcedRow(opt.roleCode)}
                    />
                    <div className="flex flex-1 items-center gap-1">
                      <DatePicker
                        value={target.startDate}
                        onChange={(date) =>
                          handleTargetDate(opt.roleCode, "startDate", date)
                        }
                        disabled={!target.checked}
                      />
                      <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010] shrink-0">
                        ~
                      </span>
                      <DatePicker
                        value={target.endDate}
                        onChange={(date) =>
                          handleTargetDate(opt.roleCode, "endDate", date)
                        }
                        disabled={!target.checked}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
