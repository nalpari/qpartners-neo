"use client";

import { useState, useMemo } from "react";
import { InputBox, Checkbox, Button, DatePicker } from "@/components/common";
import { useTargetLabels } from "@/hooks/use-target-labels";
import type { NoticeSearchFilters } from "./notices-types";

// Design Ref: §4.2 — NoticesSearch props (Target Dynamic from Role 후 — qp_roles 단일 출처)

const STATUS_OPTIONS = [
  { value: "scheduled", label: "掲示予定" },
  { value: "active", label: "掲示中" },
  { value: "ended", label: "終了" },
];

interface NoticesSearchProps {
  filters: NoticeSearchFilters;
  onSearch: (filters: NoticeSearchFilters) => void;
  onReset: () => void;
}

export function NoticesSearch({ filters, onSearch, onReset }: NoticesSearchProps) {
  // 검색 키워드는 「お知らせ内容」(content) 부분 일치.
  const [content, setContent] = useState(filters.keyword);
  const [statuses, setStatuses] = useState<string[]>(filters.statuses);
  const [author, setAuthor] = useState(filters.author);
  const [startDate, setStartDate] = useState<Date | null>(filters.startDate);
  const [endDate, setEndDate] = useState<Date | null>(filters.endDate);
  // 게시대상은 권한코드 멀티 선택 — statuses 와 동일한 toggle 패턴 (OR 조건).
  const [roleCodes, setRoleCodes] = useState<string[]>(filters.roleCodes);

  // 게시대상 옵션 — qp_roles.isActive=Y 만 동적 노출 (6 기본 + 추가 권한). 비회원 제외.
  const { memberOptions } = useTargetLabels();
  const targetOptions = useMemo(
    () =>
      memberOptions
        .filter((o): o is typeof o & { roleCode: string } => o.roleCode !== null)
        .map((o) => ({ value: o.roleCode, label: o.label })),
    [memberOptions],
  );

  const toggleStatus = (value: string, checked: boolean) => {
    setStatuses(checked ? [...statuses, value] : statuses.filter((s) => s !== value));
  };

  const toggleRoleCode = (value: string, checked: boolean) => {
    setRoleCodes(
      checked ? [...roleCodes, value] : roleCodes.filter((t) => t !== value),
    );
  };

  const handleSearch = () => {
    onSearch({
      keyword: content,
      statuses,
      roleCodes,
      startDate,
      endDate,
      author,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  const handleReset = () => {
    setContent("");
    setStatuses([]);
    setAuthor("");
    setStartDate(null);
    setEndDate(null);
    setRoleCodes([]);
    onReset();
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]">
      <div className="flex flex-col gap-1">
        {/* 1행: 공지내용 / 공지상태 */}
        <div className="flex gap-1 items-start">
          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                お知らせ内容
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={content} onChange={setContent} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
            </div>
          </div>

          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                お知らせ状態
              </span>
            </div>
            <div className="flex flex-1 items-center gap-[18px] h-full bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2 py-2">
              {STATUS_OPTIONS.map((opt) => (
                <Checkbox
                  key={opt.value}
                  checked={statuses.includes(opt.value)}
                  onChange={(checked) => toggleStatus(opt.value, checked)}
                  label={opt.label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 2행: 등록자 / 등록일 */}
        <div className="flex gap-1 items-start">
          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                登録者
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={author} onChange={setAuthor} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
            </div>
          </div>

          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                登録日
              </span>
            </div>
            <div className="flex flex-1 items-center gap-1 bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <DatePicker value={startDate} onChange={setStartDate} className="flex-1" />
              <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010] shrink-0">~</span>
              <DatePicker value={endDate} onChange={setEndDate} className="flex-1" />
            </div>
          </div>
        </div>

        {/* 3행: 게시대상 (전체 너비) */}
        <div className="flex gap-1 items-start">
          <div className="flex w-full gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                掲示対象
              </span>
            </div>
            <div className="flex flex-1 items-center gap-[18px] h-full bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2 py-2">
              {targetOptions.map((opt) => (
                <Checkbox
                  key={opt.value}
                  checked={roleCodes.includes(opt.value)}
                  onChange={(checked) => toggleRoleCode(opt.value, checked)}
                  label={opt.label}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex items-center justify-end gap-[6px] mt-[18px]">
        <Button variant="primary" onClick={handleSearch}>検索</Button>
        <Button variant="secondary" onClick={handleReset}>初期化</Button>
      </div>
    </div>
  );
}
