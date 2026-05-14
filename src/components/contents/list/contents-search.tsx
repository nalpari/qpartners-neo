"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Checkbox, SelectBox, MultiSelectCombobox, Button } from "@/components/common";
import { useTargetLabels } from "@/hooks/use-target-labels";
import api from "@/lib/axios";
import type { CategoryNode, SearchFilters } from "./contents-contents";

// 게시대상 placeholder 옵션 — 권한관리 라벨은 useTargetLabels 훅으로 동적 주입
const POST_TARGET_PLACEHOLDER = { value: "", label: "掲示対象" };

interface DeptItem {
  deptCd: string;
  deptNm: string;
}

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
  // 詳細条件 패널은 디폴트 닫힘 — 사용자가 詳細条件 버튼을 누르면 토글된다 (PC/모바일 동일).
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? "");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(initialFilters?.categoryIds ?? []);
  const [postTarget, setPostTarget] = useState(initialFilters?.roleCode ?? "");
  const [departments, setDepartments] = useState<string[]>(initialFilters?.departments ?? []);
  const [internalOnly, setInternalOnly] = useState(initialFilters?.internalOnly ?? false);
  // [x] 클릭 후 input 으로 focus 복귀용 — 클릭으로 button 이 focus 보유 시
  // 이어진 Enter 가 input 의 onKeyDown 이 아니라 button 의 click 을 다시 트리거하여
  // 검색이 동작하지 않던 결함을 차단 (Redmine #2169).
  const keywordInputRef = useRef<HTMLInputElement>(null);

  // 권한관리 라벨 동기화 — isActive=Y 만 검색 옵션 노출, 라벨은 권한명 사용.
  // (이미 등록된 콘텐츠가 isActive=N 권한과 매핑되어 있어도 목록 그리드는 별도 라벨 룩업으로 표시한다.)
  // 비회원(roleCode=null) 은 SelectBox value 로 null 을 다룰 수 없어 sentinel `__NON_MEMBER__` 사용.
  // 서버 listContentsQuerySchema 가 transform 으로 null 변환.
  const { allOptions: targetAllOptions } = useTargetLabels();
  const POST_TARGET_OPTIONS = useMemo(() => {
    return [
      POST_TARGET_PLACEHOLDER,
      ...targetAllOptions
        .filter((o) => o.isActive)
        .map((o) => ({ value: o.roleCode ?? "__NON_MEMBER__", label: o.label })),
    ];
  }, [targetAllOptions]);

  // 担当部門 옵션 — 관리자(isInternal) 노출 영역에서만 호출 (enabled 가드).
  // /codes/lookup 패턴과 동일: queryKey 도메인 네임스페이스 + 5분 staleTime + retry 2.
  const {
    data: deptItems = [],
    isPending: isDeptLoading,
    isError: isDeptLoadError,
  } = useQuery({
    queryKey: ["master", "deptList"],
    queryFn: async () => {
      const res = await api.get<{ data: DeptItem[] }>("/master/deptList");
      const items = res.data?.data;
      if (!Array.isArray(items)) {
        throw new Error("Unexpected response shape from /master/deptList");
      }
      return items;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: isInternal,
  });

  // 콘텐츠 검색의 backend 매칭은 `Content.authorDepartment` (= 작성 시 `user.deptNm` 일본어 부서명)
  // 으로 동등 비교한다. 따라서 SelectBox value 도 deptCd 가 아닌 **deptNm** 을 사용해야 매칭됨.
  // 동일 부서명이 여러 deptCd 를 갖는 비정상 케이스만 옵션 중복으로 보일 수 있으나,
  // 그 경우에도 검색 결과는 동일(부서명 매칭)하므로 기능상 문제 없음.
  const DEPARTMENT_OPTIONS = useMemo(() => {
    return deptItems.map((d) => ({ value: d.deptNm, label: d.deptNm }));
  }, [deptItems]);

  // 부서 데이터가 비어 있는 정상 응답(`{ data: [] }`) — placeholder 만 가진 SelectBox 가
  // 띄워지는 fallback UI 를 없애고 "-" 텍스트로 표시한다. 로딩/에러 상태와는 별개.
  const isDeptEmpty =
    isInternal && !isDeptLoading && !isDeptLoadError && deptItems.length === 0;

  const handleCheckboxChange = (categoryId: number, checked: boolean) => {
    setSelectedCategoryIds((prev) =>
      checked ? [...prev, categoryId] : prev.filter((id) => id !== categoryId)
    );
  };

  const handleReset = () => {
    setKeyword("");
    setSelectedCategoryIds([]);
    setPostTarget("");
    setDepartments([]);
    setInternalOnly(false);
  };

  const handleSearch = () => {
    onSearch({
      keyword,
      categoryIds: selectedCategoryIds,
      roleCode: postTarget,
      departments,
      internalOnly,
    });
  };

  // [x] 클릭 — 입력값만 비우고 재조회는 트리거하지 않는다. 사용자가 명시적으로
  // 検索/Enter 를 눌렀을 때만 검색하도록 단순화. focus 를 input 으로 복귀시켜
  // 이어진 Enter 가 button click 재트리거가 아닌 input onKeyDown 으로 처리되게 한다 (#2169).
  const handleClearKeyword = () => {
    setKeyword("");
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
                  <div className="w-full lg:max-w-[460px]">
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
                  <div className="w-full lg:max-w-[460px]">
                    {isDeptEmpty ? (
                      <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                        -
                      </span>
                    ) : (
                      <MultiSelectCombobox
                        options={DEPARTMENT_OPTIONS}
                        values={departments}
                        onChange={setDepartments}
                        placeholder="担当部門"
                        disabled={isDeptLoading || isDeptLoadError}
                        className="w-full"
                      />
                    )}
                  </div>
                  {isDeptLoadError && (
                    <p className="font-['Noto_Sans_JP'] text-[12px] leading-[1.5] text-[#ff1a1a]">
                      担当部門の読み込みに失敗しました。
                    </p>
                  )}
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
                {isDeptEmpty ? (
                  <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                    -
                  </span>
                ) : (
                  <MultiSelectCombobox
                    options={DEPARTMENT_OPTIONS}
                    values={departments}
                    onChange={setDepartments}
                    placeholder="担当部門"
                    disabled={isDeptLoading || isDeptLoadError}
                  />
                )}
                {isDeptLoadError && (
                  <p className="font-['Noto_Sans_JP'] text-[12px] leading-[1.5] text-[#ff1a1a]">
                    担当部門の読み込みに失敗しました。
                  </p>
                )}
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
