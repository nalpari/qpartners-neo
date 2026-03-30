"use client";

import type { ContentDetailItem } from "../contents-dummy-data";

interface ContentsDetailCategoryProps {
  categories: ContentDetailItem["categories"];
}

export function ContentsDetailCategory({
  categories,
}: ContentsDetailCategoryProps) {
  return (
    <div className="bg-white rounded-[12px] lg:rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-full lg:w-[1440px]">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        カテゴリー
      </h2>

      {/* PC: 4열×2행 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
        {categories.map((cat) => (
          <div
            key={cat.label}
            className="border border-[#EAF0F6] rounded-[6px] flex flex-col"
          >
            <div className="bg-[#F7F9FB] border-b border-[#EFF4F8] px-4 py-[10px] rounded-t-[6px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] truncate">
                {cat.label}
              </p>
            </div>
            <div className="bg-[#FDFEFE] px-4 py-[14px] rounded-b-[6px] min-h-[49px]">
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {cat.values}
                {cat.internalValues && (
                  <>
                    {cat.values ? ", " : ""}
                    <span className="text-[#FF1A1A]">
                      {cat.internalValues}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
