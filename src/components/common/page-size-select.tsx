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
 * 상태가 셋이고 **각각 다르게 보여야 한다**:
 * - `isHidden` — PAGE_SIZE 헤더가 비활성(N)/미등록(404). 의도된 상태 → 컴포넌트 자체 null 렌더
 * - `isError` — **조회 실패**. 비정상 → 재시도 버튼. 2026-10-13 에 DB 가 잠깐 끊긴 사이
 *   조회가 실패하자 `-` 로 고착됐고, 오류 표시도 복구 수단도 없어 새로고침 전에는
 *   원인조차 알 수 없었다. 조용히 실패하지 않게 한다
 * - 그 외 options=0 — 헤더는 활성인데 상세가 빈 상태(운영자 누락). `-` 비활성 placeholder
 *
 * 세 경우 모두 그리드 자체는 usePageSize 의 안전 기본값(20)으로 동작한다.
 */
export function PageSizeSelect({ value, onChange, className }: PageSizeSelectProps) {
  const { options, isHidden, isError, refetch } = usePageSize();
  if (isHidden) return null;
  const wrapperClass = className ? `w-[110px] ${className}` : "w-[110px]";

  if (isError) {
    return (
      <div className={wrapperClass}>
        <button
          type="button"
          data-testid="page-size-retry"
          onClick={() => void refetch()}
          title="表示件数の読み込みに失敗しました。クリックで再試行します。"
          className="flex h-[42px] w-full items-center justify-center gap-1 rounded-[4px] border border-[#f0c9c9] bg-[#fdf5f5] font-['Noto_Sans_JP'] text-[13px] text-[#c0504d] transition-colors hover:bg-[#fbeaea]"
        >
          <span aria-hidden>↻</span>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className={wrapperClass} data-testid="page-size-select">
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
