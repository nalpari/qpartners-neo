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

  return (
    <div className={`relative w-full min-w-[70px] ${className}`}>
      <div
        className={`flex items-center gap-2 w-full h-[44px] px-4 border rounded-[6px] overflow-hidden transition-colors duration-150 ${
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
