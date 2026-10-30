"use client";

import { Checkbox } from "@/components/common";
import { useIsInternal } from "@/hooks/use-is-internal";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { LEGACY_PRODUCT_STATUS_AXIS_CODE } from "@/lib/schemas/common";

/** 선택돼 있지만 활성 트리에 없는 분류 — 운영자가 그 카테고리를 「사용 = N」 으로 돌린 경우 */
export interface InactiveSelectedCategory {
  id: number;
  name: string;
  parentName: string;
  isInternalOnly: boolean;
}

interface ContentsFormCategoryProps {
  categories: CategoryNode[];
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  /**
   * 수정 모드에서 **이미 선택돼 있는데 선택지에 없는** 분류.
   *
   * 선택지는 `/api/categories?activeOnly=true` 라 사용중지 카테고리가 빠진다. 그런데 저장
   * payload 에는 그 id 가 그대로 남아 값은 보존되므로, 보여주지 않으면 **운영자가 모르는
   * 분류가 콘텐츠에 계속 붙어 있는** 상태가 된다. 목업도 비활성 선택지를 `disabled` 로
   * 남겨 둔다(`qp-shell.js:655` `enabled`).
   *
   * 되돌리려면 카테고리관리에서 「사용」을 Y 로 복구해야 한다 — 여기서는 보여주기만 한다.
   */
  inactiveSelected?: InactiveSelectedCategory[];
}

export function ContentsFormCategory({
  categories,
  selectedIds,
  onSelectedIdsChange,
  inactiveSelected = [],
}: ContentsFormCategoryProps) {
  // 사내전용 카테고리는 비사내 작성자에게 노출하지 않는다 — 1depth 는 행 자체를, 사내전용
  // 자식은 체크박스를 숨긴다. 결과적으로 비사내 작성자는 사내전용 카테고리를 부여할 수 없다
  // (조회 화면과 동일한 「사내 전용은 숨김」 정책을 등록/수정 폼에도 적용).
  // 적색 표식과 범례도 사내 사용자에게만 의미가 있으므로 함께 사내 전용으로 둔다.
  const isInternal = useIsInternal();

  const visibleCategories = categories
    .filter(
      (parent) =>
        // 제품상태는 형번의 속성이다(REQ-007) — 자료에는 입력란을 두지 않는다.
        // 연결한 형번에서 자동으로 파생되므로 등록자가 고를 값이 아니다.
        parent.categoryCode !== LEGACY_PRODUCT_STATUS_AXIS_CODE &&
        (isInternal || !parent.isInternalOnly),
    )
    .map((parent) => ({
      ...parent,
      children: parent.children.filter(
        (child) => isInternal || !child.isInternalOnly,
      ),
    }));

  const handleCheckboxChange = (categoryId: number, checked: boolean) => {
    onSelectedIdsChange(
      checked
        ? [...selectedIds, categoryId]
        : selectedIds.filter((id) => id !== categoryId)
    );
  };

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[var(--page-max)]">
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          カテゴリ
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        {isInternal && (
          <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#FF1A1A]">
            赤い文字は社内のみ表示
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {visibleCategories.map((parent) => (
          <div key={parent.id} className="flex gap-1 items-stretch min-h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              {/* 축 라벨(1Depth)은 사내전용이어도 기본색 — 적색은 2Depth 전용 (2026-10-23 결정) */}
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] whitespace-nowrap overflow-hidden text-ellipsis text-[#45576F]">
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
                    isInternal && child.isInternalOnly
                      ? "[&>span:last-child]:!text-[#FF1A1A]"
                      : ""
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 사용중지 카테고리에 이미 붙어 있는 분류 — 변경 불가, 존재만 알린다 */}
      {inactiveSelected.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[6px] border border-[#EAF0F6] bg-[#F7F9FB] px-4 py-3">
          <p className="font-['Noto_Sans_JP'] text-[12px] leading-[1.6] text-[#b42318]">
            ※ 使用停止中のカテゴリが紐づいています。保存しても維持されます。変更するには「カテゴリ管理」で該当カテゴリの「使用」を Y に戻してください。
          </p>
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[8px]">
            {inactiveSelected.map((item) => (
              <Checkbox
                key={item.id}
                checked
                disabled
                label={`${item.parentName} > ${item.name}`}
                className={
                  isInternal && item.isInternalOnly
                    ? "[&>span:last-child]:!text-[#FF1A1A]"
                    : ""
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
