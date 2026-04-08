"use client";

// Design Ref: §4.3 — 게시대상 사내 전용, 5타입 전체 표시

const ALL_TARGET_TYPES = [
  { key: "first_store", label: "一次点" },
  { key: "second_store", label: "2次点以下" },
  { key: "seko", label: "施工店" },
  { key: "general", label: "一般会員" },
  { key: "non_member", label: "非会員" },
] as const;

interface TargetItem {
  id: number;
  targetType: string;
  startAt: string | null;
  endAt: string | null;
}

interface ContentsDetailTargetProps {
  targets: TargetItem[];
}

function formatPeriod(startAt: string | null, endAt: string | null): string {
  if (!startAt && !endAt) return "-";
  const fmt = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");
  const start = startAt ? fmt(startAt) : "";
  const end = endAt ? fmt(endAt) : "";
  return `${start}~${end}`;
}

export function ContentsDetailTarget({ targets }: ContentsDetailTargetProps) {
  const targetMap = new Map(targets.map((t) => [t.targetType, t]));

  return (
    <>
      {/* PC: 가로 셀 나열 */}
      <div className="hidden lg:block bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] p-6 w-[1440px]">
        <div className="flex gap-1">
          {/* Th: 投稿対象 */}
          <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 self-stretch">
            <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
              投稿対象
            </span>
          </div>
          {ALL_TARGET_TYPES.map((type, idx) => {
            const matched = targetMap.get(type.key);
            const active = !!matched;

            return (
              <div
                key={type.key}
                className={`flex flex-col gap-2 bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 self-stretch justify-center ${
                  idx < 2 ? "flex-1" : "w-[254px] shrink-0"
                } py-3`}
              >
                <span
                  className={`inline-flex items-center justify-center self-start px-2 py-[2px] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] truncate ${
                    active
                      ? "bg-[#EFF7FF] text-[#1060B4] font-medium"
                      : "bg-[#F3F3F3] text-[#101010] font-normal"
                  }`}
                >
                  {type.label}
                </span>
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                  {active ? formatPeriod(matched.startAt, matched.endAt) : "-"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* MO: 세로 나열 */}
      <div className="block lg:hidden bg-white px-6 py-[34px] w-full">
        <div className="flex flex-col gap-6">
          {ALL_TARGET_TYPES.map((type, idx) => {
            const matched = targetMap.get(type.key);
            const active = !!matched;

            return (
              <div key={type.key} className="flex flex-col gap-2">
                {idx === 0 && (
                  <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] mb-1">
                    投稿対象
                  </p>
                )}
                <span
                  className={`inline-flex items-center justify-center self-start px-2 py-[2px] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] ${
                    active
                      ? "bg-[#EFF7FF] text-[#1060B4] font-medium"
                      : "bg-[#F3F3F3] text-[#101010] font-normal"
                  }`}
                >
                  {type.label}
                </span>
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                  {active ? formatPeriod(matched.startAt, matched.endAt) : "-"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
