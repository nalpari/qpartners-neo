"use client";

// Design Ref: §5.2 — 좌측 카테고리 트리 목록 패널

import Image from "next/image";
import { Checkbox } from "@/components/common";
import type { CategoryNode } from "./categories-types";

interface CategoriesTreeProps {
  treeData: CategoryNode[];
  selectedId: number | null;
  expandedIds: Record<number, true>;
  totalCount: number;
  filterInternalOnly: boolean;
  filterActiveOnly: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onFilterChange: (checked: boolean) => void;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CategoriesTree({
  treeData,
  selectedId,
  expandedIds,
  totalCount,
  filterInternalOnly,
  filterActiveOnly,
  onSelect,
  onToggle,
  onFilterChange,
  onActiveOnlyChange,
}: CategoriesTreeProps) {
  return (
    <section className="flex-1 flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_0px_rgba(0,0,0,0.05)] pt-[34px] px-[42px] pb-[42px]">
      {/* Header */}
      <div className="flex flex-col gap-[24px]">
        <h2 className="text-[16px] font-medium text-[#45576f] font-['Noto_Sans_JP']">
          カテゴリ一覧
        </h2>
        <div className="flex items-center gap-[18px]">
          <p className="flex-1 text-[14px] text-[#101010] font-['Noto_Sans_JP']">
            Total{" "}
            <span className="font-semibold text-[#e97923]">{totalCount}</span>
          </p>
          <Checkbox
            checked={filterActiveOnly}
            onChange={onActiveOnlyChange}
            label="使用可否Yのみ表示"
          />
          <Checkbox
            checked={filterInternalOnly}
            onChange={onFilterChange}
            label="社内専用のみ表示"
          />
        </div>
      </div>

      {/* Thead — body 1Depth/2Depth row 의 우측 영역과 동일한 폭/gap/padding 으로 정렬 일치.
          (좌측 flex-1 + 우측 w-[350px] gap-[16px] pr-[16px] / 각 셀 너비는 body 와 1:1 매핑) */}
      <div className="flex h-[58px] items-center rounded-[6px] overflow-hidden">
        <div className="flex-1 flex items-center justify-center h-full bg-[#506273] pl-[16px] pr-[8px] rounded-l-[6px]">
          <span className="text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            カテゴリ名
          </span>
        </div>
        <div className="flex items-center justify-end h-full bg-[#506273] w-[350px] gap-[16px] pr-[30px] rounded-r-[6px]">
          <span className="w-[80px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            社内専用
          </span>
          <span className="w-[50px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            使用
          </span>
          <span className="w-[50px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            表示
          </span>
          <span className="w-[50px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            注文
          </span>
        </div>
      </div>

      {/* Body — scrollbar-gutter: stable 로 스크롤바 영역을 항상 예약.
          데이터 양에 따라 세로 스크롤바가 생겨도 row 의 가로 길이가 변하지 않아 thead 와 정렬이 유지된다. */}
      <div className="flex flex-col gap-[18px] max-h-[640px] overflow-y-auto">
        {treeData.map((parent) => (
          <div key={parent.id} className="flex flex-col gap-[4px]">
            {/* 1Depth Row */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(parent.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(parent.id); } }}
              className={`flex items-center h-[58px] pl-[18px] pr-[16px] py-[12px] rounded-[6px] bg-[#eef3f9] border w-full text-left cursor-pointer transition-all duration-200 hover:bg-[#e5edf6] ${
                selectedId === parent.id ? "border-[#101010]" : "border-[#d8e2ed]"
              }`}
            >
              <div className="flex-1 flex items-center gap-[12px]">
                <div className="flex items-center">
                  {/* Arrow */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(parent.id);
                    }}
                    className="size-[24px] flex items-center justify-center transition-transform duration-200"
                    style={{
                      transform: expandedIds[parent.id] ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                    aria-label={expandedIds[parent.id] ? "折りたたむ" : "展開する"}
                  >
                    <Image
                      src="/asset/images/contents/category_arr.svg"
                      alt=""
                      width={24}
                      height={24}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-[6px]">
                  <Image
                    src="/asset/images/contents/depth1_icon.svg"
                    alt=""
                    width={24}
                    height={24}
                  />
                  <span className="text-[14px] font-semibold text-[#101010] font-['Noto_Sans_JP']">
                    {parent.name}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-end w-[350px] gap-[16px]">
                <span className="w-[80px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {parent.isInternalOnly ? "Y" : "N"}
                </span>
                <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {parent.isActive ? "Y" : "N"}
                </span>
                <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {parent.isVisible ? "Y" : "N"}
                </span>
                <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {parent.sortOrder}
                </span>
              </div>
            </div>

            {/* 2Depth Rows — grid 트랜지션으로 펼침/접힘 애니메이션 */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{
                gridTemplateRows: expandedIds[parent.id] ? "1fr" : "0fr",
              }}
            >
              <div className="overflow-hidden flex flex-col gap-[4px]">
                {parent.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSelect(child.id)}
                    className={`flex items-center h-[58px] pl-[72px] pr-[16px] py-[12px] rounded-[6px] border w-full text-left transition-all duration-300 hover:bg-[#f5f8fc] ${
                      expandedIds[parent.id] ? "opacity-100" : "opacity-0"
                    } ${
                      selectedId === child.id ? "border-[#101010]" : "border-[#e6eef6]"
                    }`}
                  >
                    <div className="flex-1 flex items-center">
                      <div className="flex-1 flex items-center gap-[6px]">
                        <Image
                          src="/asset/images/contents/depth2_icon.svg"
                          alt=""
                          width={24}
                          height={24}
                        />
                        <span className="text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                          {child.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end w-[300px] gap-[16px]">
                      <span className="w-[80px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        {child.isInternalOnly ? "Y" : "N"}
                      </span>
                      <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        {child.isActive ? "Y" : "N"}
                      </span>
                      {/* 表示 컬럼은 1Depth(부모) 카테고리에만 적용 — 콘텐츠 목록 ag-grid 의
                          parent 컬럼 노출 토글이므로 자식 행은 "-" 로 표시. */}
                      <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        -
                      </span>
                      <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        {child.sortOrder}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
