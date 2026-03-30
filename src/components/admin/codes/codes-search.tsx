"use client";

import { InputBox, Button } from "@/components/common";

interface CodesSearchProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
}

export function CodesSearch({
  keyword,
  onKeywordChange,
  onSearch,
  onReset,
}: CodesSearchProps) {
  return (
    <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]">
      <div className="flex gap-1 items-start">
        {/* Header Code 입력 */}
        <div className="flex flex-1 gap-1 h-[58px] items-center">
          <div className="w-[160px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
            <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
              Header Code
            </span>
          </div>
          <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
            <InputBox value={keyword} onChange={onKeywordChange} placeholder="" className="w-full" />
          </div>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="flex items-center justify-end gap-[6px] mt-[18px]">
        <Button variant="primary" onClick={onSearch}>
          検索
        </Button>
        <Button variant="secondary" onClick={onReset}>
          初期化
        </Button>
      </div>
    </div>
  );
}
