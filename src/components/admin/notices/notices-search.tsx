"use client";

import { useState } from "react";
import { InputBox, Checkbox, Button, DatePicker } from "@/components/common";

const STATUS_OPTIONS = [
  { value: "scheduled", label: "掲示予定" },
  { value: "active", label: "掲示中" },
  { value: "ended", label: "終了" },
];

const TARGET_OPTIONS = [
  { value: "super-admin", label: "スーパー管理者" },
  { value: "admin", label: "管理者" },
  { value: "first-dealer", label: "1次店" },
  { value: "second-dealer", label: "2次店以下" },
  { value: "installer", label: "施工店" },
  { value: "general", label: "一般会員" },
];

export function NoticesSearch() {
  const [content, setContent] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [author, setAuthor] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [targets, setTargets] = useState<string[]>([]);

  const toggleStatus = (value: string, checked: boolean) => {
    setStatuses(checked ? [...statuses, value] : statuses.filter((s) => s !== value));
  };

  const toggleTarget = (value: string, checked: boolean) => {
    setTargets(checked ? [...targets, value] : targets.filter((t) => t !== value));
  };

  const handleReset = () => {
    setContent("");
    setStatuses([]);
    setAuthor("");
    setStartDate(null);
    setEndDate(null);
    setTargets([]);
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
              <InputBox value={content} onChange={setContent} placeholder="" className="w-full" />
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
              <InputBox value={author} onChange={setAuthor} placeholder="" className="w-full" />
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
              {TARGET_OPTIONS.map((opt) => (
                <Checkbox
                  key={opt.value}
                  checked={targets.includes(opt.value)}
                  onChange={(checked) => toggleTarget(opt.value, checked)}
                  label={opt.label}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex items-center justify-end gap-[6px] mt-[18px]">
        <Button variant="primary">検索</Button>
        <Button variant="secondary" onClick={handleReset}>初期化</Button>
      </div>
    </div>
  );
}
