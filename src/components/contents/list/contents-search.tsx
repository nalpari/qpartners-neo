"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Checkbox, SelectBox, Button } from "@/components/common";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTargetLabels } from "@/hooks/use-target-labels";
import type { CategoryNode, SearchFilters } from "./contents-contents";

// 게시대상 placeholder 옵션 — 권한관리 라벨은 useTargetLabels 훅으로 동적 주입
const POST_TARGET_PLACEHOLDER = { value: "", label: "掲示対象" };

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
  initialFilters?: SearchFilters;
}

export function ContentsSearch({
  isInternal = false,
  categories,
  onSearch,
  initialFilters,
}: ContentsSearchProps) {
  const isMobile = useIsMobile();
  // 사용자가 토글하기 전에는 뷰포트 반응형 (PC: 열림, MO: 닫힘)
  // 토글 후에는 사용자 선택값 유지
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isFilterOpen = userToggled ?? !isMobile;
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? "");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(initialFilters?.categoryIds ?? []);
  const [postTarget, setPostTarget] = useState(initialFilters?.targetType ?? "");
  const [department, setDepartment] = useState(initialFilters?.department ?? "");
  const [internalOnly, setInternalOnly] = useState(initialFilters?.internalOnly ?? false);
  // [x] 클릭 후 input 으로 focus 복귀용 — 클릭으로 button 이 focus 보유 시
  // 이어진 Enter 가 input 의 onKeyDown 이 아니라 button 의 click 을 다시 트리거하여
  // 검색이 동작하지 않던 결함을 차단 (Redmine #2169).
  const keywordInputRef = useRef<HTMLInputElement>(null);

  // 권한관리 라벨 동기화 — isActive=Y 만 검색 옵션 노출, 라벨은 권한명 사용.
  // (이미 등록된 콘텐츠가 isActive=N 권한과 매핑되어 있어도 목록 그리드는 별도 라벨 룩업으로 표시한다.)
  const { getAllOptions: getTargetOptions } = useTargetLabels();
  const POST_TARGET_OPTIONS = useMemo(() => {
    return [
      POST_TARGET_PLACEHOLDER,
      ...getTargetOptions()
        .filter((o) => o.isActive)
        .map((o) => ({ value: o.value, label: o.label })),
    ];
  }, [getTargetOptions]);

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

  /**
   * [x] 클릭 — keyword 비우고 즉시 빈 키워드로 onSearch 트리거.
   *
   * setState 비동기 특성상 setKeyword 직후 handleSearch() 를 호출하면 keyword 가
   * 아직 이전 값이라 빈 문자열로 검색되지 않는다. onSearch 에 직접 빈 문자열을 명시.
   * 이어서 input 으로 focus 복귀 — 사용자가 추가로 Enter 를 쳐도 button 의 click 이
   * 다시 트리거되지 않고 input 의 onKeyDown 으로 정상 처리된다 (Redmine #2169 결함).
   * 다른 필터(카테고리/대상/부서/사내전용) 는 보존 — 사용자가 키워드만 지운 의도 유지.
   */
  const handleClearKeyword = () => {
    setKeyword("");
    onSearch({
      keyword: "",
      categoryIds: selectedCategoryIds,
      targetType: postTarget,
      department,
      internalOnly,
    });
    keywordInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  return (
    <div className="flex flex-col gap-2 w-full lg:w-[1440px]">
      {/* 검색바 래퍼 */}
      <div className="pt-[18px] pb-2 px-6 lg:p-0">
        <div className="flex items-start bg-white rounded-[8px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden h-[60px]">
          <div className="flex flex-1 items-center h-[60px] pl-5">
            <input
              ref={keywordInputRef}
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
            onClick={handleClearKeyword}
            aria-label="キーワードをクリア"
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
            onClick={() => setUserToggled((prev) => !(prev ?? !isMobile))}
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
                <div className="w-[160px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
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
                <div className="w-[160px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
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
                <div className="w-[160px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
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
