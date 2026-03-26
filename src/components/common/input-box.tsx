"use client";

import { useRef } from "react";
import Image from "next/image";

interface InputBoxProps {
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  clearable?: boolean;
  type?: "text" | "password" | "email" | "number" | "tel" | "url";
  className?: string;
}

export function InputBox({
  value,
  onChange,
  onClear,
  placeholder = "",
  disabled = false,
  readOnly = false,
  clearable = false,
  type = "text",
  className = "",
}: InputBoxProps) {
  const inactive = disabled || readOnly;
  const showClear = clearable && !inactive && value;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`flex items-center gap-2 w-full min-w-[70px] h-[42px] px-4 border rounded-[4px] overflow-hidden transition-colors duration-150 ${
        inactive
          ? "bg-[#F5F5F5] border-[#EBEBEB] cursor-not-allowed"
          : "bg-white border-[#EBEBEB] hover:border-[#D1D1D1] focus-within:border-[#101010]"
      } ${className}`}
    >
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={`flex-1 min-w-0 h-full font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none placeholder:text-[#AAAAAA] ${
          inactive ? "text-[#999] cursor-not-allowed" : "text-[#101010]"
        }`}
      />
      {showClear && (
        <button
          type="button"
          onClick={() => {
            onChange?.("");
            onClear?.();
            inputRef.current?.focus();
          }}
          className="flex items-center justify-center shrink-0 cursor-pointer"
          tabIndex={-1}
          aria-label="クリア"
        >
          <Image
            src="/asset/images/common/close_circle.svg"
            alt=""
            width={18}
            height={18}
          />
        </button>
      )}
    </div>
  );
}
