"use client";

import { useEffect, useState } from "react";

import { Button, InputBox, PageSizeSelect, SelectBox } from "@/components/common";
import { MODEL_CODE_SEARCH_MIN } from "@/lib/schemas/product-model";

import {
  VISIBILITY_OPTIONS,
  type ProductCategoryOption,
  type ProductModelSearchFilters,
} from "./product-models-types";

/**
 * 型番 입력 디바운스(ms).
 *
 * 목업 03 은 `input` 이벤트마다 즉시 목록을 다시 그린다(로컬 배열이라 공짜다).
 * 여기서는 매 타이핑이 서버 조회가 되므로 입력만 디바운스한다 — 체감은 즉시 검색과
 * 같고, 카테고리·표시여부 select 는 지연 없이 바로 반영한다.
 */
const MODEL_CODE_DEBOUNCE_MS = 400;

interface ProductModelsSearchProps {
  filters: ProductModelSearchFilters;
  categoryOptions: ProductCategoryOption[];
  total: number;
  /** 목록 조회 실패 여부 — 실패 시 건수를 `0` 이 아니라 `-` 로 보인다 */
  isError: boolean;
  pageSize: number;
  onFiltersChange: (filters: ProductModelSearchFilters) => void;
  onReset: () => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * 형번 목록 검색조건 — 목업 03 검색바(`型番` / `カテゴリ` / `表示／非表示` + `初期化`).
 *
 * 検索 버튼이 없다. 목업이 조건 변경 즉시 목록을 갱신하는 방식이라 그대로 따랐고,
 * 입력만 디바운스를 둔다.
 *
 * ⚠️ `型番` 입력은 로컬 버퍼라, 부모가 `初期化` 로 필터를 비울 때는 **key 를 바꿔
 *    리마운트**해야 입력칸도 함께 비워진다(공지관리 `resetKey` 와 같은 규약).
 *    외부 값 변화를 useEffect 로 setState 해 맞추면 React Compiler 의
 *    set-state-in-effect 규칙에 걸린다.
 */
export function ProductModelsSearch({
  filters,
  categoryOptions,
  total,
  isError,
  pageSize,
  onFiltersChange,
  onReset,
  onPageSizeChange,
}: ProductModelsSearchProps) {
  const [modelCode, setModelCode] = useState(filters.modelCode);

  useEffect(() => {
    if (modelCode === filters.modelCode) return;
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, modelCode });
    }, MODEL_CODE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [modelCode, filters, onFiltersChange]);

  const categorySelectOptions = [{ value: "", label: "すべて" }, ...categoryOptions];

  // 3자 미만은 서버가 조건에서 제외한다 — 입력했는데 목록이 안 움직이는 이유를 그 자리에서 알린다.
  const isBelowSearchMin =
    modelCode.trim().length > 0 && modelCode.trim().length < MODEL_CODE_SEARCH_MIN;

  return (
    <div className="flex flex-col gap-[8px]">
      {/* **한 줄 고정** (2026-10-14 사용자 지시). 목록 카드를 넓힌 뒤(상세 520px 고정)
          조건 3개 + `初期化` + 건수 select 가 한 줄에 들어간다.
          고정폭으로 깔면 합이 카드 폭을 넘겨 다시 줄바꿈되므로, `型番`·`カテゴリ` 를
          **남는 폭을 나눠 갖는 가변폭**으로 두고 나머지(表示／非表示·버튼·건수)만 고정한다. */}
      <div className="flex items-end gap-[12px]">
        {/* key + translate="no" — 브라우저 자동 번역이 「Total N」 을 통째로 바꿔치기한 뒤
            React 가 숫자만 갱신하면 옛 건수가 그대로 남는다(contents-table 의 合計 와 같은 건). */}
        <p
          key={`total-${isError ? "err" : total}`}
          className="shrink-0 font-['Noto_Sans_JP'] text-[14px] text-[#101010] pb-[11px]"
        >
          Total{" "}
          {/* 조회 실패에 `0` 을 쓰면 「0건 조회됨」과 구분되지 않는다 (2026-10-13 피드백 7) */}
          <span
            data-testid="product-models-total"
            translate="no"
            className="font-semibold text-[#e97923]"
          >
            {isError ? "-" : total}
          </span>
        </p>

        <div className="flex min-w-0 flex-1 items-end gap-[8px]">
          <SearchField label="型番" className="min-w-0 flex-[1.3]">
            <InputBox
              value={modelCode}
              onChange={setModelCode}
              placeholder="型番で検索"
              clearable
            />
          </SearchField>

          <SearchField label="カテゴリ" className="min-w-0 flex-[1.5]">
            <SelectBox
              options={categorySelectOptions}
              value={filters.categoryId}
              onChange={(value) => onFiltersChange({ ...filters, categoryId: value })}
              placeholder="すべて"
            />
          </SearchField>

          <SearchField label="表示／非表示" className="w-[140px] shrink-0">
            <SelectBox
              options={VISIBILITY_OPTIONS}
              value={filters.visibility}
              onChange={(value) => onFiltersChange({ ...filters, visibility: value })}
              placeholder="すべて"
            />
          </SearchField>

          <Button variant="secondary" className="shrink-0" onClick={onReset}>
            初期化
          </Button>
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} className="shrink-0" />
        </div>
      </div>

      <p
        className={`font-['Noto_Sans_JP'] text-[12px] text-[#6a88a9] min-h-[18px] ${
          isBelowSearchMin ? "" : "invisible"
        }`}
      >
        {`型番は${MODEL_CODE_SEARCH_MIN}文字以上で絞り込みます。`}
      </p>
    </div>
  );
}

function SearchField({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-[4px] ${className}`}>
      <span className="font-['Noto_Sans_JP'] font-medium text-[12px] leading-[1.5] text-[#45576f] whitespace-nowrap">
        {label}
      </span>
      {children}
    </div>
  );
}
