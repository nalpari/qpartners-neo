"use client";

import { useState, useRef } from "react";
import Image from "next/image";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectBoxProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function SelectBox({
  options,
  value,
  onChange,
  placeholder = "選択してください",
  disabled = false,
  readOnly = false,
  className = "",
}: SelectBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inactive = disabled || readOnly;

  const selectedOption = options.find((opt) => opt.value === value);

  const handleBlur = (e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full min-w-[70px] ${className}`}
      onBlur={handleBlur}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !inactive && setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 w-full h-[44px] px-4 border rounded-[6px] text-left transition-colors duration-150 focus:border-[#101010] ${
          inactive
            ? "bg-[#F5F5F5] border-[#E0E0E0] cursor-not-allowed"
            : "bg-white border-[#EBEBEB] cursor-pointer hover:border-[#D1D1D1]"
        } ${isOpen ? "border-[#E97923]" : ""}`}
      >
        <span
          className={`flex-1 font-['Noto_Sans_JP'] text-sm leading-[1.5] truncate ${
            inactive
              ? "text-[#AAAAAA]"
              : selectedOption
                ? "text-[#101010]"
                : "text-[#AAAAAA]"
          }`}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <Image
          src="/asset/images/common/select_arr.svg"
          alt=""
          width={24}
          height={24}
          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${inactive ? "opacity-50" : ""}`}
        />
      </button>

      {/* 드롭다운 */}
      {!inactive && (
        <div
          className={`absolute top-full left-0 z-10 w-full mt-1 bg-white border border-[#EBEBEB] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-[240px] overflow-y-auto transition-all duration-200 origin-top ${
            isOpen
              ? "opacity-100 scale-y-100 visible"
              : "opacity-0 scale-y-95 invisible"
          }`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`flex items-center w-full px-4 h-[40px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-left transition-colors duration-100 ${
                option.value === value
                  ? "bg-[#FFF5ED] text-[#E97923]"
                  : "text-[#101010] hover:bg-[#F5F5F5]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
