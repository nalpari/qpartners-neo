"use client";

import { useRef } from "react";
import ReactDatePicker from "react-datepicker";
import Image from "next/image";
import "react-datepicker/dist/react-datepicker.css";

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  dateFormat?: string;
  minDate?: Date;
  maxDate?: Date;
}

/** YYYYMMDD 문자열 → Date. 유효하지 않으면 null 반환 (rollover 차단 포함). */
function parseYyyymmdd(raw: string): Date | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function DatePicker({
  value = null,
  onChange,
  placeholder = "日付を選択",
  disabled = false,
  readOnly = false,
  className = "",
  dateFormat = "yyyy/MM/dd",
  minDate,
  maxDate,
}: DatePickerProps) {
  const inactive = disabled || readOnly;
  const datePickerRef = useRef<ReactDatePicker>(null);

  const handleIconClick = () => {
    if (!inactive && datePickerRef.current) {
      datePickerRef.current.setOpen(true);
    }
  };

  /**
   * Enter 입력 시 raw 문자열을 YYYYMMDD 형식으로 파싱하여 선택값으로 반영.
   * react-datepicker 기본 파서는 커스텀 형식(숫자 8자리) 을 인식하지 못해 revert 되는 현상 회피.
   * - min/maxDate 범위 외면 적용하지 않음
   * - 파싱 실패 시 기본 동작 유지 (revert)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    // IME(한글/일본어 등) 조합 중 Enter 는 조합 확정으로 처리 — 날짜 파싱/적용 건너뜀
    if (e.nativeEvent.isComposing) return;
    const target = e.target as HTMLInputElement;
    const parsed = parseYyyymmdd(target.value ?? "");
    if (!parsed) return;
    if (minDate && parsed.getTime() < minDate.getTime()) return;
    if (maxDate && parsed.getTime() > maxDate.getTime()) return;
    e.preventDefault();
    onChange?.(parsed);
    datePickerRef.current?.setOpen(false);
  };

  return (
    <div className={`relative w-full min-w-[70px] ${className}`}>
      <div
        className={`flex items-center gap-2 w-full h-[44px] px-4 border rounded-[4px] overflow-hidden transition-colors duration-150 ${
          inactive
            ? "bg-[#F5F5F5] border-[#E0E0E0] cursor-not-allowed"
            : "bg-white border-[#EBEBEB] hover:border-[#D1D1D1] focus-within:border-[#101010]"
        }`}
      >
        <div className="flex-1 min-w-0 h-full [&_.react-datepicker-wrapper]:w-full [&_.react-datepicker-wrapper]:h-full [&_.react-datepicker__input-container]:w-full [&_.react-datepicker__input-container]:h-full">
          <ReactDatePicker
            ref={datePickerRef}
            selected={value}
            onChange={(date: Date | null) => onChange?.(date)}
            onKeyDown={handleKeyDown}
            dateFormat={dateFormat}
            placeholderText={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            minDate={minDate}
            maxDate={maxDate}
            className={`w-full h-full font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none placeholder:text-[#AAAAAA] ${
              inactive ? "text-[#AAAAAA] cursor-not-allowed" : "text-[#101010]"
            }`}
            calendarClassName="qp-datepicker"
            popperPlacement="bottom-start"
          />
        </div>
        <button
          type="button"
          onClick={handleIconClick}
          disabled={inactive}
          className={`flex items-center justify-center shrink-0 ${
            inactive ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
          tabIndex={-1}
          aria-label="カレンダーを開く"
        >
          <Image
            src="/asset/images/common/datepicker.svg"
            alt=""
            width={24}
            height={24}
          />
        </button>
      </div>
    </div>
  );
}
