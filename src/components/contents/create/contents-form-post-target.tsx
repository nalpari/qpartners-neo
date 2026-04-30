"use client";

import { Checkbox, DatePicker } from "@/components/common";

/** Figma 기준 행/열 배치 순서 */
const POST_TARGET_ROWS = [
  [
    { key: "first_store", label: "一次点" },
    { key: "seko", label: "施工店" },
    { key: "non_member", label: "非会員" },
  ],
  [
    { key: "second_store", label: "2次点以下" },
    { key: "general", label: "一般会員" },
    null, // 빈 셀
  ],
] as const;

const ALL_KEYS = POST_TARGET_ROWS.flat().flatMap((item) =>
  item ? [item.key] : []
);

interface PostTargetItem {
  key: string;
  label: string;
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
}

export function getInitialPostTargets(): PostTargetState {
  const today = new Date();
  return {
    selectAll: false,
    allStartDate: today,
    allEndDate: new Date("2999-12-31"),
    targets: ALL_KEYS.map((key) => {
      const row = POST_TARGET_ROWS.flat().find((r) => r?.key === key)!;
      return {
        key,
        label: row.label,
        checked: false,
        startDate: new Date(today),
        endDate: new Date(today),
      };
    }),
  };
}

export function ContentsFormPostTarget({
  postTargets,
  onPostTargetsChange,
}: ContentsFormPostTargetProps) {
  // 체크 활성화 시 상단 공통 기간(allStartDate/allEndDate)을 즉시 적용한다.
  //
  // root cause: 기존엔 checked 토글만 했고 startDate/endDate 는 `getInitialPostTargets` 가
  // 부여한 "등록 시각" 그대로였다. 사용자가 「全選択」+ 상단 공통기간 변경 후 「選択の適用」
  // 을 누르지 않으면, 각 ContentTarget.endAt 이 등록일 KST 자정(=UTC -9h, 즉 등록 시점보다
  // 과거)으로 저장되어 GET 의 publication window(`endAt gte now`) 가 즉시 false 가 된다.
  // 결과: 비사내 회원에게 노출되지 않음.
  //
  // 해제(checked=false) 시에는 기존 기간을 보존한다 — 사용자가 의도적으로 끈 케이스에서
  // 다시 켰을 때 미세 조정값이 사라지지 않도록 한다.
  const applyCommonPeriod = (
    target: PostTargetItem,
    checked: boolean,
  ): PostTargetItem => {
    if (!checked) return { ...target, checked };
    return {
      ...target,
      checked,
      startDate: postTargets.allStartDate
        ? new Date(postTargets.allStartDate)
        : target.startDate,
      endDate: postTargets.allEndDate
        ? new Date(postTargets.allEndDate)
        : target.endDate,
    };
  };

  const handleSelectAll = (checked: boolean) => {
    onPostTargetsChange({
      ...postTargets,
      selectAll: checked,
      targets: postTargets.targets.map((t) => applyCommonPeriod(t, checked)),
    });
  };

  const handleTargetCheck = (key: string, checked: boolean) => {
    const newTargets = postTargets.targets.map((t) =>
      t.key === key ? applyCommonPeriod(t, checked) : t,
    );
    const allChecked = newTargets.every((t) => t.checked);
    onPostTargetsChange({
      ...postTargets,
      selectAll: allChecked,
      targets: newTargets,
    });
  };

  const handleTargetDate = (
    key: string,
    field: "startDate" | "endDate",
    date: Date | null
  ) => {
    onPostTargetsChange({
      ...postTargets,
      targets: postTargets.targets.map((t) =>
        t.key === key ? { ...t, [field]: date } : t
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
          : t
      ),
    });
  };

  const getTarget = (key: string) =>
    postTargets.targets.find((t) => t.key === key);

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-[14px] pt-[34px] pb-6 px-6 w-[1440px]">
      {/* 타이틀 */}
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        投稿対象
      </h2>

      {/* 헤더 바: 전체선택 + 기간 + 적용 + 안내 */}
      <div className="flex items-center gap-[18px] bg-[#F7F9FB] rounded-[6px] px-4 py-[14px]">
        <Checkbox
          checked={postTargets.selectAll}
          onChange={handleSelectAll}
          label="全選択/解除"
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
        </p>
      </div>

      {/* 대상 테이블 */}
      <div className="flex flex-col gap-1">
        {POST_TARGET_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-1">
            {row.map((item, colIdx) => {
              const target = item ? getTarget(item.key) : null;

              return (
                <div key={colIdx} className="flex flex-1 gap-1 h-[58px]">
                  {/* Th */}
                  <div
                    className={`w-[120px] shrink-0 flex items-center pl-4 pr-2 rounded-[6px] border border-[#EAF0F6] ${
                      item ? "bg-[#F7F9FB]" : "bg-white"
                    }`}
                  >
                    {item && (
                      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap truncate">
                        {item.label}
                      </span>
                    )}
                  </div>
                  {/* Form */}
                  <div className="flex-1 flex items-center gap-2 bg-white border border-[#EAF0F6] rounded-[6px] p-2">
                    {item && target && (
                      <>
                        <Checkbox
                          checked={target.checked}
                          onChange={(checked) =>
                            handleTargetCheck(item.key, checked)
                          }
                        />
                        <div className="flex flex-1 items-center gap-1">
                          <DatePicker
                            value={target.startDate}
                            onChange={(date) =>
                              handleTargetDate(item.key, "startDate", date)
                            }
                            disabled={!target.checked}
                          />
                          <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010] shrink-0">
                            ~
                          </span>
                          <DatePicker
                            value={target.endDate}
                            onChange={(date) =>
                              handleTargetDate(item.key, "endDate", date)
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
        ))}
      </div>
    </section>
  );
}
