"use client";

import { SelectBox } from "./select-box";
import { usePageSize } from "@/hooks/use-page-size";

interface PageSizeSelectProps {
  value: number;
  onChange: (size: number) => void;
  /** 외부 래퍼에 추가 클래스 적용 (e.g. `ml-auto`). width 는 기본 w-[110px] 로 고정. */
  className?: string;
}

/**
 * 페이지 사이즈 선택 SelectBox — 전역 통일 width 110px.
 * 옵션 소스는 PAGE_SIZE 공통코드 (/api/codes/lookup).
 * state는 소비 측이 관리 (value / onChange).
 */
export function PageSizeSelect({ value, onChange, className }: PageSizeSelectProps) {
  const { options } = usePageSize();
  const wrapperClass = className ? `w-[110px] ${className}` : "w-[110px]";
  return (
    <div className={wrapperClass}>
      <SelectBox
        options={options}
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
      />
    </div>
  );
}
