"use client";

import { Checkbox } from "@/components/common";
import type { CategoryNode } from "@/components/contents/list/contents-contents";

interface ContentsFormCategoryProps {
  categories: CategoryNode[];
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
}

export function ContentsFormCategory({
  categories,
  selectedIds,
  onSelectedIdsChange,
}: ContentsFormCategoryProps) {
  const handleCheckboxChange = (categoryId: number, checked: boolean) => {
    onSelectedIdsChange(
      checked
        ? [...selectedIds, categoryId]
        : selectedIds.filter((id) => id !== categoryId)
    );
  };

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          カテゴリ
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#FF1A1A]">
          赤い文字は社内のみ表示
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {categories.map((parent) => (
          <div key={parent.id} className="flex gap-1 items-stretch min-h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                {parent.name}
              </span>
            </div>
            <div className="flex-1 flex flex-wrap items-center gap-x-[18px] gap-y-[8px] bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2 py-2">
              {parent.children.map((child) => (
                <Checkbox
                  key={child.id}
                  checked={selectedIds.includes(child.id)}
                  onChange={(checked) => handleCheckboxChange(child.id, checked)}
                  label={child.name}
                  className={
                    child.isInternalOnly
                      ? "[&>span:last-child]:!text-[#FF1A1A]"
                      : ""
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
