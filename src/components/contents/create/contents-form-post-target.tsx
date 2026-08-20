"use client";

import { Checkbox, DatePicker, TimeSelect } from "@/components/common";
import { useTargetLabels, type TargetRoleOption } from "@/hooks/use-target-labels";
import { jstHourStart } from "@/lib/jst-day";

/**
 * 날짜와 시각을 각각 다른 입력이 담당하므로, 한쪽을 바꿀 때 다른 쪽 값을 보존해야 한다.
 * 두 헬퍼가 그 이식을 전담한다 — 분·초는 항상 0 (시 단위 정책).
 */

/** 종료일을 처음 고를 때 채워지는 시각 — 그 날 끝까지 노출한다는 뜻. */
const END_DEFAULT_HOUR = 23;

/** `date` 의 날짜 부분에 `hour` 시를 얹은 새 Date. */
function withHour(date: Date, hour: number): Date {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
}

/**
 * 날짜 선택 결과에 기존 시각을 이식. 기존 값이 없으면 `defaultHour`.
 *
 * 종료일의 defaultHour 가 23 인 이유: 종전 일 단위 정책에서 종료일 지정은 "그 날 종일 노출"
 * 이었다. 0시를 기본으로 두면 날짜를 고르는 순간 즉시 만료되어 의도와 정반대가 된다.
 * (기존 데이터도 같은 이유로 마이그레이션에서 23시로 보정한다)
 */
function mergeDate(
  picked: Date | null,
  previous: Date | null,
  defaultHour = 0,
): Date | null {
  if (!picked) return null;
  return withHour(picked, previous ? previous.getHours() : defaultHour);
}

/** 시각 입력의 표시값 — 날짜가 비어 있으면(=입력 잠금) 0시로 표기. */
function hourOf(date: Date | null): number {
  return date ? date.getHours() : 0;
}

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
  // 게시기간은 시 단위까지만 지정하므로 기본값도 정각으로 절삭한다 —
  // 안 자르면 "14:32 에 등록 → 14:32 부터 노출" 이 되어 화면 표기(14:00)와 어긋난다.
  const today = jstHourStart();

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
    // forcedRoleCode 행은 신규 등록 시점부터 체크 + 시작일은 오늘, 종료일은 비움(상시 공개).
    return {
      roleCode: opt.roleCode,
      checked: isForced,
      startDate: new Date(today),
      endDate: null,
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
      endDate: null,
    });
  }

  return {
    selectAll: items.length > 0 && items.every((i) => i.checked),
    allStartDate: today,
    allEndDate: null,
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
        // 날짜만 갈아끼우고 시각은 TimeSelect 가 정한 값을 유지한다.
        t.roleCode === roleCode
          ? { ...t, [field]: mergeDate(date, t[field], field === "endDate" ? END_DEFAULT_HOUR : 0) }
          : t,
      ),
    });
  };

  const handleTargetHour = (
    roleCode: string | null,
    field: "startDate" | "endDate",
    hour: number,
  ) => {
    onPostTargetsChange({
      ...postTargets,
      targets: postTargets.targets.map((t) => {
        if (t.roleCode !== roleCode) return t;
        const current = t[field];
        // 날짜가 없으면 시각만 따로 보관할 곳이 없다 — UI 에서도 잠겨 있는 상태.
        if (!current) return t;
        return { ...t, [field]: withHour(current, hour) };
      }),
    });
  };

  const handleApplyAll = () => {
    onPostTargetsChange({
      ...postTargets,
      targets: postTargets.targets.map((t) =>
        t.checked
          ? {
              ...t,
              // startDate 는 필수 입력이므로 null 헤더값은 기존 행값 보존 (검증 단계에서 차단)
              startDate: postTargets.allStartDate
                ? new Date(postTargets.allStartDate)
                : t.startDate,
              // endDate 는 null = 상시 공개 정책 — 헤더 null 도 명시 전파해야 일괄 적용 가능
              endDate:
                postTargets.allEndDate !== null
                  ? new Date(postTargets.allEndDate)
                  : null,
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
                onPostTargetsChange({
                  ...postTargets,
                  allStartDate: mergeDate(date, postTargets.allStartDate),
                })
              }
              className="w-[150px]"
            />
            <TimeSelect
              value={hourOf(postTargets.allStartDate)}
              onChange={(hour) =>
                onPostTargetsChange({
                  ...postTargets,
                  allStartDate: postTargets.allStartDate
                    ? withHour(postTargets.allStartDate, hour)
                    : null,
                })
              }
              disabled={!postTargets.allStartDate}
              ariaLabel="開始時間を選択"
              className="w-[80px]"
            />
            <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">
              ~
            </span>
            <DatePicker
              value={postTargets.allEndDate}
              onChange={(date) =>
                onPostTargetsChange({
                  ...postTargets,
                  allEndDate: mergeDate(date, postTargets.allEndDate, END_DEFAULT_HOUR),
                })
              }
              placeholder="終了日なし"
              className="w-[150px]"
            />
            <TimeSelect
              value={hourOf(postTargets.allEndDate)}
              onChange={(hour) =>
                onPostTargetsChange({
                  ...postTargets,
                  allEndDate: postTargets.allEndDate
                    ? withHour(postTargets.allEndDate, hour)
                    : null,
                })
              }
              disabled={!postTargets.allEndDate}
              ariaLabel="終了時間を選択"
              className="w-[80px]"
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

      {/* 대상 옵션 — 동적 grid (2열 자동 wrapping).
          한 행이 날짜+시각 4개 입력을 담게 되어 3열로는 폭이 부족해 2열로 낮췄다. */}
      <div className="grid grid-cols-2 gap-1">
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
                  title={opt.label}
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
                      <TimeSelect
                        value={hourOf(target.startDate)}
                        onChange={(hour) =>
                          handleTargetHour(opt.roleCode, "startDate", hour)
                        }
                        disabled={!target.checked || !target.startDate}
                        ariaLabel={`${opt.label} 開始時間を選択`}
                        className="w-[80px]"
                      />
                      <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010] shrink-0">
                        ~
                      </span>
                      <DatePicker
                        value={target.endDate}
                        onChange={(date) =>
                          handleTargetDate(opt.roleCode, "endDate", date)
                        }
                        placeholder="終了日なし"
                        disabled={!target.checked}
                      />
                      <TimeSelect
                        value={hourOf(target.endDate)}
                        onChange={(hour) =>
                          handleTargetHour(opt.roleCode, "endDate", hour)
                        }
                        disabled={!target.checked || !target.endDate}
                        ariaLabel={`${opt.label} 終了時間を選択`}
                        className="w-[80px]"
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
