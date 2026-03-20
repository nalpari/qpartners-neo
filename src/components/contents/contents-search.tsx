"use client";

import { useState } from "react";
import Image from "next/image";
import { Checkbox, SelectBox, Button } from "@/components/common";
import {
  FILTER_CATEGORIES,
  DEPARTMENT_OPTIONS,
  POST_TARGET_OPTIONS,
} from "./contents-filter-data";

interface FilterState {
  [key: string]: string[];
}

interface ContentsSearchProps {
  isAdmin?: boolean;
  onSearch?: (filters: FilterState) => void;
}

export function ContentsSearch({
  isAdmin = false,
}: ContentsSearchProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [postTarget, setPostTarget] = useState("");
  const [department, setDepartment] = useState("");
  const [internalOnly, setInternalOnly] = useState(false);

  const handleCheckboxChange = (categoryKey: string, value: string, checked: boolean) => {
    setFilters((prev) => {
      const current = prev[categoryKey] ?? [];
      return {
        ...prev,
        [categoryKey]: checked
          ? [...current, value]
          : current.filter((v) => v !== value),
      };
    });
  };

  const handleReset = () => {
    setKeyword("");
    setFilters({});
    setPostTarget("");
    setDepartment("");
    setInternalOnly(false);
  };

  return (
    <div className="flex flex-col gap-2 w-[1440px]">
      {/* 검색바 */}
      <div className="flex items-start bg-white rounded-[8px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden h-[60px]">
        <div className="flex flex-1 items-center h-[60px] pl-5">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="検索語を入力してください"
            className="flex-1 font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] placeholder:text-[#999] outline-none bg-transparent"
          />
        </div>
        <button
          type="button"
          className="flex items-center justify-center size-[60px] shrink-0"
          onClick={() => setKeyword("")}
          aria-label="検索クリア"
        >
          <Image
            src="/asset/images/layout/search_delete.svg"
            alt=""
            width={60}
            height={60}
            unoptimized
          />
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-2.5 h-full px-4 bg-[#246097] shrink-0"
          onClick={() => setIsFilterOpen((prev) => !prev)}
        >
          <span className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-white whitespace-nowrap">
            詳細条件
          </span>
          <svg
            width="7"
            height="4"
            viewBox="0 0 7 4"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`}
          >
            <path d="M0.5 0.5L3.5 3.5L6.5 0.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 상세조건 패널 */}
      <div
        className={`transition-all duration-500 ${
          isFilterOpen ? "max-h-[2000px]" : "max-h-0 overflow-hidden"
        }`}
      >
        <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[34px]">
          <div className="flex flex-col gap-px bg-white border border-[#EAF0F6] rounded-[6px] [&>*:first-child>*:first-child]:rounded-tl-[5px] [&>*:first-child>*:nth-child(2)]:rounded-tr-[5px] [&>*:last-child>*:first-child]:rounded-bl-[5px] [&>*:last-child>*:nth-child(2)]:rounded-br-[5px]">
            {FILTER_CATEGORIES.map((category) => (
              <div key={category.key} className="flex items-center min-h-[58px]">
                <div className="w-[112px] shrink-0 self-stretch flex items-center bg-[#F7F9FB] border-r border-b border-[#EAF0F6] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                    {category.label}
                  </span>
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-x-[18px] gap-y-[8px] bg-[#FDFEFE] border-b border-[#EAF0F6] self-stretch pl-6 pr-2 py-2">
                  {category.items.map((item) => {
                    if (item.internalOnly && !isAdmin) return null;
                    return (
                      <Checkbox
                        key={item.value}
                        checked={(filters[category.key] ?? []).includes(item.value)}
                        onChange={(checked) => handleCheckboxChange(category.key, item.value, checked)}
                        label={item.label}
                        className={item.internalOnly ? "[&>span:last-child]:!text-[#FF1A1A]" : ""}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {/* 관리자 전용: 게시대상 */}
            {isAdmin && (
              <div className="flex items-center min-h-[58px]">
                <div className="w-[112px] shrink-0 self-stretch flex items-center bg-[#F7F9FB] border-r border-b border-[#EAF0F6] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                    投稿対象
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-2 bg-[#FDFEFE] border-b border-[#EAF0F6] self-stretch pl-6 pr-2 py-2 ">
                  <SelectBox
                    options={POST_TARGET_OPTIONS}
                    value={postTarget}
                    onChange={setPostTarget}
                    disabled={internalOnly}
                    className="w-full lg:w-[300px]"
                  />
                  <Checkbox
                    checked={internalOnly}
                    onChange={setInternalOnly}
                    label="保証申請"
                    className="shrink-0"
                  />
                </div>
              </div>
            )}

            {/* 관리자 전용: 담당부문 */}
            {isAdmin && (
              <div className="flex items-center min-h-[58px]">
                <div className="w-[112px] shrink-0 self-stretch flex items-center bg-[#F7F9FB] border-r border-[#EAF0F6] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                    担当部門
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-[18px] bg-[#FDFEFE] self-stretch pl-6 pr-2 py-2">
                  <SelectBox
                    options={DEPARTMENT_OPTIONS}
                    value={department}
                    onChange={setDepartment}
                    className="w-full lg:w-[300px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 버튼 영역 */}
          <div className="flex items-center justify-end gap-[6px] mt-[18px]">
            <Button variant="secondary" onClick={handleReset}>
              初期化
            </Button>
            <Button variant="primary">
              検索
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
