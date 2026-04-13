"use client";

import { useState } from "react";
import Image from "next/image";
import type { CategoryNode } from "@/components/contents/list/contents-contents";

// Design Ref: §4.4 — 카테고리 8그룹 매핑, isInternalOnly 적색, 콤마 처리

interface CategoryTreeItem {
  id: number;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  children: { id: number; categoryCode: string; name: string; isInternalOnly: boolean }[];
}

interface ContentsDetailCategoryProps {
  categories: CategoryTreeItem[];
  categoryTree: CategoryNode[];
  isInternal: boolean;
}

export function ContentsDetailCategory({
  categories,
  categoryTree,
  isInternal,
}: ContentsDetailCategoryProps) {
  // 부모 그룹(parentId=null) 추출
  const parentGroups = categoryTree.filter((c) => c.parentId === null);

  // 각 그룹별 매칭된 자식 카테고리 구성
  const groupedCategories = parentGroups.map((parent) => {
    // 콘텐츠 categories에서 해당 부모 그룹 찾기
    const matched = categories.find((c) => c.categoryCode === parent.categoryCode);
    const children = matched?.children ?? [];

    const normalItems = children.filter((c) => !c.isInternalOnly);
    const internalItems = children.filter((c) => c.isInternalOnly);

    return {
      label: parent.name,
      normalValues: normalItems.map((c) => c.name),
      internalValues: isInternal ? internalItems.map((c) => c.name) : [],
    };
  });

  const [categoryOpen, setCategoryOpen] = useState(true);

  if (groupedCategories.every((g) => g.normalValues.length === 0 && g.internalValues.length === 0)) return null;

  const categoryGrid = groupedCategories.map((group) => {
    const hasValues = group.normalValues.length > 0 || group.internalValues.length > 0;

    return (
      <div
        key={group.label}
        className="border border-[#EAF0F6] rounded-[6px] flex flex-col"
      >
        <div className="bg-[#F7F9FB] border-b border-[#EFF4F8] px-4 py-[10px] rounded-t-[6px]">
          <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] truncate">
            {group.label}
          </p>
        </div>
        <div className="bg-[#FDFEFE] px-4 py-[14px] rounded-b-[6px] min-h-[49px]">
          {hasValues ? (
            <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
              {group.normalValues.join(", ")}
              {group.internalValues.length > 0 && (
                <>
                  {group.normalValues.length > 0 ? ", " : ""}
                  <span className="text-[#FF1A1A]">
                    {group.internalValues.join(", ")}
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
            </p>
          )}
        </div>
      </div>
    );
  });

  return (
    <>
      {/* PC: 기존 레이아웃 */}
      <div className="hidden lg:flex bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex-col gap-4 pt-[34px] pb-6 px-6 max-w-[1440px] w-full">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          カテゴリー
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {categoryGrid}
        </div>
      </div>

      {/* MO: 토글 레이아웃 */}
      <div className="block lg:hidden bg-white px-6 py-6 w-full">
        <button
          type="button"
          onClick={() => setCategoryOpen((prev) => !prev)}
          className="flex items-center gap-[10px] w-full cursor-pointer"
          aria-expanded={categoryOpen}
          aria-controls="category-panel"
        >
          <p className="flex-1 text-left font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
            カテゴリー
          </p>
          <Image
            src="/asset/images/contents/content_toggle.svg"
            alt=""
            width={32}
            height={32}
            className={`transition-transform duration-200 ${categoryOpen ? "" : "rotate-180"}`}
          />
        </button>

        <div
          id="category-panel"
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: categoryOpen ? "1fr" : "0fr" }}
          aria-hidden={!categoryOpen}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-4 mt-6">
              <h3 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
                カテゴリー
              </h3>
              <div className="flex flex-col gap-2">
                {categoryGrid}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
