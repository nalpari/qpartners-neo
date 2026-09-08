"use client";

import { useRef } from "react";
import ReactDatePicker from "react-datepicker";
import Image from "next/image";

import { jstHourStart } from "@/lib/jst-day";
import "react-datepicker/dist/react-datepicker.css";

/**
 * 날짜 + 시각을 한 달력에서 고르는 입력.
 *
 * 입력 박스 스킨은 `DatePicker` 와 동일하게 맞췄다 — 같은 폼 안에서 나란히 쓰이므로
 * 테두리·높이·포커스 색이 어긋나면 안 된다. 다만 게시기간 전용 요구(시 단위 선택)라
 * `DatePicker` 에 prop 을 늘리지 않고 별도 컴포넌트로 유지한다(다른 화면 영향 차단).
 *
 * `timeIntervals={60}` 이라 정시 24개만 노출되며 분 단위는 제공하지 않는다.
 */

interface DateTimePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 기본 `yyyy/MM/dd H時`. 「時」는 date-fns 예약 토큰이 아니라 리터럴로 출력된다. */
  dateFormat?: string;
  minDate?: Date;
  maxDate?: Date;
  /**
   * 시각 목록에서 선택 가능한 항목을 걸러낸다 (true = 선택 가능).
   *
   * 기본 미적용 — 게시기간 시작일은 이미 게시된 콘텐츠를 수정할 때 과거일 수 있어야 하므로
   * "과거 차단" 을 기본값으로 두지 않는다.
   */
  filterTime?: (time: Date) => boolean;
}

export function DateTimePicker({
  value = null,
  onChange,
  placeholder = "日時を選択",
  disabled = false,
  className = "",
  dateFormat = "yyyy/MM/dd H時",
  minDate,
  maxDate,
  filterTime,
}: DateTimePickerProps) {
  const datePickerRef = useRef<ReactDatePicker>(null);

  const handleIconClick = () => {
    if (!disabled && datePickerRef.current) {
      datePickerRef.current.setOpen(true);
    }
  };

  // 바깥 래퍼에 `position: relative` 를 두지 않는다 — 팝퍼(absolute)의 containing block 이
  // 이 190px 래퍼가 되면 shrink-to-fit 폭이 날짜 컬럼만으로 꽉 차서 시각 컬럼이 아래로
  // 떨어진다. 래퍼 안에 absolute 자식이 없으므로 뺄 수 있다(날짜 전용 DatePicker 는 컬럼이
  // 하나뿐이라 영향이 없어 기존 구조를 그대로 둔다).
  return (
    <div className={`w-full min-w-[70px] ${className}`}>
      <div
        className={`flex items-center gap-2 w-full h-[44px] px-4 border rounded-[4px] overflow-hidden transition-colors duration-150 ${
          disabled
            ? "bg-[#F5F5F5] border-[#E0E0E0] cursor-not-allowed"
            : "bg-white border-[#EBEBEB] hover:border-[#D1D1D1] focus-within:border-[#101010]"
        }`}
      >
        <div className="flex-1 min-w-0 h-full [&_.react-datepicker-wrapper]:w-full [&_.react-datepicker-wrapper]:h-full [&_.react-datepicker__input-container]:w-full [&_.react-datepicker__input-container]:h-full">
          <ReactDatePicker
            ref={datePickerRef}
            selected={value}
            // 정각으로 스냅 — 목록 클릭은 원래 정각이지만 입력칸에 직접 타이핑하면
            // react-datepicker 가 `10:37` 을 그대로 흘린다(strictParsing 미적용 + keepInput).
            // 서버 스키마도 절삭하므로(schemas/content.ts) 여기서 맞춰야 화면 == 저장값.
            onChange={(date: Date | null) => onChange?.(date ? jstHourStart(date) : null)}
            showTimeSelect
            // 정시만 노출 — 분 단위 선택은 제공하지 않는다.
            timeIntervals={60}
            timeFormat="H時"
            timeCaption="時間"
            filterTime={filterTime}
            dateFormat={dateFormat}
            placeholderText={placeholder}
            disabled={disabled}
            minDate={minDate}
            maxDate={maxDate}
            className={`w-full h-full font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none placeholder:text-[#AAAAAA] ${
              disabled ? "text-[#AAAAAA] cursor-not-allowed" : "text-[#101010]"
            }`}
            calendarClassName="qp-datepicker qp-datepicker--with-time"
            popperPlacement="bottom-start"
          />
        </div>
        <button
          type="button"
          onClick={handleIconClick}
          disabled={disabled}
          className={`flex items-center justify-center shrink-0 ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
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
