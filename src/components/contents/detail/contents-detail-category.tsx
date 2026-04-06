"use client";

import type { CategoryNode } from "@/components/contents/list/contents-contents";

// Design Ref: §4.4 — 카테고리 8그룹 매핑, isInternalOnly 적색, 콤마 처리

interface CategoryItem {
  id: number;
  name: string;
  categoryCode: string;
  isInternalOnly: boolean;
}

interface ContentsDetailCategoryProps {
  categories: CategoryItem[];
  categoryTree: CategoryNode[];
  isInternal: boolean;
}

export function ContentsDetailCategory({
  categories,
  categoryTree,
  isInternal,
}: ContentsDetailCategoryProps) {
  // 부모 그룹(parentId=null) 추출 — 고정 8개 카테고리 그룹 (7-2)
  const parentGroups = categoryTree.filter((c) => c.parentId === null);

  // 콘텐츠 카테고리 ID 셋
  const contentCategoryIds = new Set(categories.map((c) => c.id));

  // 각 그룹별 매칭된 자식 카테고리 구성
  const groupedCategories = parentGroups.map((parent) => {
    const matchedChildren = parent.children.filter((child) =>
      contentCategoryIds.has(child.id)
    );

    // 일반 항목과 사내 전용 항목 분리
    const normalItems = matchedChildren.filter((c) => !c.isInternalOnly);
    const internalItems = matchedChildren.filter((c) => c.isInternalOnly);

    return {
      label: parent.name,
      normalValues: normalItems.map((c) => c.name),
      internalValues: isInternal ? internalItems.map((c) => c.name) : [],
    };
  });

  if (groupedCategories.length === 0) return null;

  return (
    <div className="bg-white rounded-[12px] lg:rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-full lg:w-[1440px]">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        カテゴリー
      </h2>

      {/* PC: 4열×2행 그리드 / MO: 1열 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
        {groupedCategories.map((group) => {
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
                    {/* (7-3) 복수개면 콤마 처리 */}
                    {group.normalValues.join(", ")}
                    {/* (7-1) 사내 전용 항목 적색 표시 */}
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
                    {/* (7-3) 없으면 미표시 */}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
