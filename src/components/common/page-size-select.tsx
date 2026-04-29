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
 * PAGE_SIZE 헤더코드가 비활성(N) 이거나 미등록인 경우 lookup API 가 404 → usePageSize 가
 * `isHidden=true` 로 응답. 이때 컴포넌트 자체를 null 렌더해 사용자에게 노출되지 않게 한다.
 * 소비 측 그리드는 usePageSize 가 강제하는 default 20 으로 동작 (숨김 ↔ 기본값 정합).
 */
export function PageSizeSelect({ value, onChange, className }: PageSizeSelectProps) {
  const { options, isHidden } = usePageSize();
  if (isHidden) return null;
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
