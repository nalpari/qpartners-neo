"use client";

import { Checkbox } from "@/components/common";
import { FILTER_CATEGORIES } from "./contents-filter-data";

interface ContentsFormCategoryProps {
  categories: Record<string, string[]>;
  onCategoriesChange: (categories: Record<string, string[]>) => void;
}

export function ContentsFormCategory({
  categories,
  onCategoriesChange,
}: ContentsFormCategoryProps) {
  const handleCheckboxChange = (
    categoryKey: string,
    value: string,
    checked: boolean
  ) => {
    const current = categories[categoryKey] ?? [];
    onCategoriesChange({
      ...categories,
      [categoryKey]: checked
        ? [...current, value]
        : current.filter((v) => v !== value),
    });
  };

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[34px] w-[1440px]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-['Noto_Sans_JP'] font-bold text-[16px] leading-[1.5] text-[#333]">
          カテゴリ
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#FF1A1A]">
          赤い文字は社内のみ表示
        </span>
      </div>

      <div className="flex flex-col gap-px border border-[#EAF0F6] rounded-[6px] [&>*:first-child>*:first-child]:rounded-tl-[5px] [&>*:first-child>*:nth-child(2)]:rounded-tr-[5px] [&>*:last-child>*:first-child]:rounded-bl-[5px] [&>*:last-child>*:nth-child(2)]:rounded-br-[5px]">
        {FILTER_CATEGORIES.map((category) => (
          <div key={category.key} className="flex items-center min-h-[58px]">
            <div className="w-[112px] shrink-0 self-stretch flex items-center bg-[#F7F9FB] border-r border-b border-[#EAF0F6] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                {category.label}
              </span>
            </div>
            <div className="flex-1 flex flex-wrap items-center gap-x-[18px] gap-y-[8px] bg-[#FDFEFE] border-b border-[#EAF0F6] self-stretch pl-6 pr-2 py-2">
              {category.items.map((item) => (
                <Checkbox
                  key={item.value}
                  checked={(categories[category.key] ?? []).includes(
                    item.value
                  )}
                  onChange={(checked) =>
                    handleCheckboxChange(category.key, item.value, checked)
                  }
                  label={item.label}
                  className={
                    item.internalOnly
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
