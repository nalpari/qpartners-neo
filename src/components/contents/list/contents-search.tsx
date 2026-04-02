"use client";

import { useState } from "react";
import Image from "next/image";
import { Checkbox, SelectBox, Button } from "@/components/common";
import type { CategoryNode, SearchFilters } from "./contents-contents";

// 관리자용 게시대상 옵션
const POST_TARGET_OPTIONS = [
  { value: "", label: "掲示対象" },
  { value: "first_dealer", label: "1次販売店" },
  { value: "second_dealer", label: "2次以降の販売店" },
  { value: "installer", label: "施工店" },
  { value: "general", label: "一般" },
  { value: "non_member", label: "非会員" },
];

// 관리자용 담당부門 옵션
const DEPARTMENT_OPTIONS = [
  { value: "", label: "担当部門" },
  { value: "sales", label: "営業" },
  { value: "marketing", label: "マーケティング" },
  { value: "tech", label: "技術" },
  { value: "construction", label: "施工" },
  { value: "cumulative", label: "累積" },
  { value: "quality", label: "品質保証" },
  { value: "cs", label: "CS" },
  { value: "ppa", label: "PPAサービス" },
  { value: "management", label: "経営企画" },
  { value: "planning", label: "企画管理" },
  { value: "it", label: "IT管理" },
];

interface ContentsSearchProps {
  isInternal?: boolean;
  categories: CategoryNode[];
  onSearch: (filters: SearchFilters) => void;
}

export function ContentsSearch({
  isInternal = false,
  categories,
  onSearch,
}: ContentsSearchProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [postTarget, setPostTarget] = useState("");
  const [department, setDepartment] = useState("");
  const [internalOnly, setInternalOnly] = useState(false);

  const handleCheckboxChange = (categoryId: number, checked: boolean) => {
    setSelectedCategoryIds((prev) =>
      checked ? [...prev, categoryId] : prev.filter((id) => id !== categoryId)
    );
  };

  const handleReset = () => {
    setKeyword("");
    setSelectedCategoryIds([]);
    setPostTarget("");
    setDepartment("");
    setInternalOnly(false);
  };

  const handleSearch = () => {
    onSearch({
      keyword,
      categoryIds: selectedCategoryIds,
      targetType: postTarget,
      department,
      internalOnly,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="flex flex-col gap-2 w-full lg:w-[1440px]">
      {/* 검색바 래퍼 */}
      <div className="pt-[18px] pb-2 px-6 lg:p-0">
        <div className="flex items-start bg-white rounded-[8px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden h-[60px]">
          <div className="flex flex-1 items-center h-[60px] pl-5">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
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
            className="flex items-center justify-center gap-2.5 h-full px-6 lg:px-4 bg-[#246097] shrink-0"
            onClick={() => setIsFilterOpen((prev) => !prev)}
          >
            <span className="hidden lg:inline font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-white whitespace-nowrap">
              詳細条件
            </span>
            <svg
              width="9"
              height="6"
              viewBox="0 0 7 4"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={`transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`}
            >
              <path d="M0.5 0.5L3.5 3.5L6.5 0.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 상세조건 패널 */}
      <div
        className={`transition-all duration-500 ${
          isFilterOpen ? "max-h-[3000px]" : "max-h-0 overflow-hidden"
        }`}
      >
        {/* 데스크톱: 테이블 형식 */}
        <div className="hidden lg:block bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[34px]">
          <div className="flex flex-col gap-1">
            {categories.map((parent) => (
              <div key={parent.id} className="flex gap-1 items-stretch min-h-[58px]">
                <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                    {parent.name}
                  </span>
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-x-[18px] gap-y-[8px] bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2 py-2">
                  {parent.children.map((child) => {
                    if (child.isInternalOnly && !isInternal) return null;
                    return (
                      <Checkbox
                        key={child.id}
                        checked={selectedCategoryIds.includes(child.id)}
                        onChange={(checked) => handleCheckboxChange(child.id, checked)}
                        label={child.name}
                        className={child.isInternalOnly ? "[&>span:last-child]:!text-[#FF1A1A]" : ""}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {isInternal && (
              <div className="flex gap-1 items-stretch min-h-[58px]">
                <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                    掲示対象
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-2 bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2 py-2">
                  <div className="w-full lg:max-w-[300px]">
                    <SelectBox
                      options={POST_TARGET_OPTIONS}
                      value={postTarget}
                      onChange={setPostTarget}
                      disabled={internalOnly}
                      className="w-full"
                    />
                  </div>
                  <Checkbox
                    checked={internalOnly}
                    onChange={setInternalOnly}
                    label="社内会員の掲示のみ表示"
                    className="shrink-0"
                  />
                </div>
              </div>
            )}

            {isInternal && (
              <div className="flex gap-1 items-stretch min-h-[58px]">
                <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                    担当部門
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-[18px] bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2 py-2">
                  <div className="w-full lg:max-w-[300px]">
                    <SelectBox
                      options={DEPARTMENT_OPTIONS}
                      value={department}
                      onChange={setDepartment}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-[6px] mt-[18px]">
            <Button variant="secondary" onClick={handleReset}>
              初期化
            </Button>
            <Button variant="primary" onClick={handleSearch}>
              検索
            </Button>
          </div>
        </div>

        {/* 모바일: 세로 나열 형식 */}
        <div className="block lg:hidden bg-white px-6 py-[34px]">
          <div className="flex flex-col gap-[18px]">
            {categories.map((parent, idx) => (
              <div
                key={parent.id}
                className={`flex flex-col gap-3 ${idx > 0 ? "border-t border-[#EFF4F8] pt-[18px]" : ""}`}
              >
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] truncate">
                  {parent.name}
                </p>
                <div className="flex flex-col gap-4">
                  {parent.children.map((child) => {
                    if (child.isInternalOnly && !isInternal) return null;
                    return (
                      <Checkbox
                        key={child.id}
                        checked={selectedCategoryIds.includes(child.id)}
                        onChange={(checked) => handleCheckboxChange(child.id, checked)}
                        label={child.name}
                        className={child.isInternalOnly ? "[&>span:last-child]:!text-[#FF1A1A]" : ""}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {isInternal && (
              <div className="flex flex-col gap-3 border-t border-[#EFF4F8] pt-[18px]">
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] truncate">
                  掲示対象
                </p>
                <div className="flex flex-col gap-[18px]">
                  <SelectBox
                    options={POST_TARGET_OPTIONS}
                    value={postTarget}
                    onChange={setPostTarget}
                    disabled={internalOnly}
                  />
                  <Checkbox
                    checked={internalOnly}
                    onChange={setInternalOnly}
                    label="社内会員の掲示のみ表示"
                  />
                </div>
              </div>
            )}

            {isInternal && (
              <div className="flex flex-col gap-3 border-t border-[#EFF4F8] pt-[18px]">
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] truncate">
                  担当部門
                </p>
                <SelectBox
                  options={DEPARTMENT_OPTIONS}
                  value={department}
                  onChange={setDepartment}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 pb-1">
            <Button variant="secondary" onClick={handleReset} fullWidth>
              初期化
            </Button>
            <Button variant="primary" onClick={handleSearch} fullWidth>
              検索
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
