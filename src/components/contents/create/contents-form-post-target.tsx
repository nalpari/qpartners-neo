"use client";

import { Checkbox, DatePicker } from "@/components/common";

/** Figma 기준 행/열 배치 순서 */
const POST_TARGET_ROWS = [
  [
    { key: "firstDealer", label: "一次点" },
    { key: "installer", label: "施工店" },
    { key: "nonMember", label: "非会員" },
  ],
  [
    { key: "secondDealer", label: "2次点以下" },
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
  const handleSelectAll = (checked: boolean) => {
    onPostTargetsChange({
      ...postTargets,
      selectAll: checked,
      targets: postTargets.targets.map((t) => ({ ...t, checked })),
    });
  };

  const handleTargetCheck = (key: string, checked: boolean) => {
    const newTargets = postTargets.targets.map((t) =>
      t.key === key ? { ...t, checked } : t
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
