"use client";

// Design Ref: §5.2 — 좌측 카테고리 트리 목록 패널

import Image from "next/image";
import { Checkbox, INTERNAL_CATEGORY_TEXT_CLASS } from "@/components/common";
import type { CategoryNode } from "./categories-types";
import { resolveInternalOnlyValue, resolveProductListValue } from "./categories-types";

interface CategoriesTreeProps {
  treeData: CategoryNode[];
  selectedId: number | null;
  expandedIds: Record<number, true>;
  totalCount: number;
  filterInternalOnly: boolean;
  filterActiveOnly: boolean;
  /** 「製品一覧表示のみ」 필터 (REQ-008) */
  filterProductListOnly: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onFilterChange: (checked: boolean) => void;
  onActiveOnlyChange: (checked: boolean) => void;
  onProductListOnlyChange: (checked: boolean) => void;
}

export function CategoriesTree({
  treeData,
  selectedId,
  expandedIds,
  totalCount,
  filterInternalOnly,
  filterActiveOnly,
  filterProductListOnly,
  onSelect,
  onToggle,
  onFilterChange,
  onActiveOnlyChange,
  onProductListOnlyChange,
}: CategoriesTreeProps) {
  return (
    <section className="flex min-w-0 flex-[6] flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_0px_rgba(0,0,0,0.05)] pt-[34px] px-[42px] pb-[42px]">
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
            checked={filterProductListOnly}
            onChange={onProductListOnlyChange}
            label="製品一覧表示のみ"
          />
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

      {/* Thead — 셀 너비·gap 은 body 1Depth/2Depth row 와 1:1 매핑 (80/80/50/68/68, gap 16).
          제품일람 컬럼(REQ-008)이 맨 앞에 추가되면서 우측 블록이 350 → 470 으로 늘었다.
          ※ 헤더는 pr-[30px], 행은 pr-[16px] 로 우측 여백이 14px 어긋나 있다 — 제품일람 추가
             이전부터 그런 상태이며, 이번 변경으로 달라지지 않았다. */}
      <div className="flex h-[58px] items-center rounded-[6px] overflow-hidden">
        <div className="flex-1 flex items-center justify-center h-full bg-[#506273] pl-[16px] pr-[8px] rounded-l-[6px]">
          <span className="text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            カテゴリ名
          </span>
        </div>
        <div className="flex items-center justify-end h-full bg-[#506273] w-[470px] gap-[16px] pr-[30px] rounded-r-[6px]">
          <span className="w-[80px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            製品一覧
          </span>
          <span className="w-[80px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            社内専用
          </span>
          <span className="w-[50px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            使用
          </span>
          <span className="w-[68px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            一覧表示
          </span>
          <span className="w-[68px] text-center text-[14px] font-semibold text-white font-['Noto_Sans_JP']">
            表示順序
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
                  {/* 1Depth 는 사내전용이어도 기본색 — 적색은 2Depth 전용 (2026-10-23 결정) */}
                  <span className="text-[14px] font-semibold font-['Noto_Sans_JP'] text-[#101010]">
                    {parent.name}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-end w-[470px] gap-[16px]">
                {/* 製品一覧 — 1Depth 는 자식 전원 Y 일 때만 Y (하위 전체 토글의 표시값) */}
                <span className="w-[80px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {resolveProductListValue(parent) ? "Y" : "N"}
                </span>
                {/* 社内専用 — 1Depth 는 자식 전원 Y 일 때만 Y (製品一覧 과 같은 규칙) */}
                <span className="w-[80px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {resolveInternalOnlyValue(parent) ? "Y" : "N"}
                </span>
                <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {parent.isActive ? "Y" : "N"}
                </span>
                <span className="w-[68px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                  {parent.isVisible ? "Y" : "N"}
                </span>
                <span className="w-[68px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
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
                        <span
                          className={`text-[14px] font-['Noto_Sans_JP'] ${
                            child.isInternalOnly ? INTERNAL_CATEGORY_TEXT_CLASS : "text-[#101010]"
                          }`}
                        >
                          {child.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end w-[420px] gap-[16px]">
                      {/* 製品一覧 — 형번이 실제로 붙는 계층이라 자식 행이 본값이다 */}
                      <span className="w-[80px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        {child.isProductList ? "Y" : "N"}
                      </span>
                      <span className="w-[80px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        {child.isInternalOnly ? "Y" : "N"}
                      </span>
                      <span className="w-[50px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        {child.isActive ? "Y" : "N"}
                      </span>
                      {/* 一覧表示 컬럼은 1Depth(부모) 카테고리에만 적용 — 콘텐츠 목록 ag-grid 의
                          parent 컬럼 노출 토글이므로 자식 행은 "-" 로 표시. */}
                      <span className="w-[68px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
                        -
                      </span>
                      <span className="w-[68px] text-center text-[14px] text-[#101010] font-['Noto_Sans_JP']">
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
