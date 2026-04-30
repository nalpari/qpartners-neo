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
 *
 * - PAGE_SIZE 헤더가 비활성(N)/미등록(404)일 때 → 컴포넌트 자체 null 렌더 (isHidden)
 * - API 실패·헤더 활성이지만 details 가 비어있을 때 → 하드코딩 fallback 없이
 *   "-" 비활성 placeholder 렌더 (운영자가 공통코드를 누락했음을 시각적으로 노출).
 *   그리드 자체는 usePageSize 의 안전 기본값(20)으로 동작.
 */
export function PageSizeSelect({ value, onChange, className }: PageSizeSelectProps) {
  const { options, isHidden } = usePageSize();
  if (isHidden) return null;
  const wrapperClass = className ? `w-[110px] ${className}` : "w-[110px]";
  return (
    <div className={wrapperClass}>
      <SelectBox
        options={options}
        value={options.length > 0 ? String(value) : ""}
        onChange={(v) => onChange(Number(v))}
        disabled={options.length === 0}
        placeholder="-"
      />
    </div>
  );
}
