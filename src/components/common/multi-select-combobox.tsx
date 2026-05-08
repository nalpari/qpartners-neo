"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelectCombobox({
  options,
  values,
  onChange,
  placeholder = "選択してください",
  disabled = false,
  className = "",
}: MultiSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, ]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return values.map((v) => ({ value: v, label: map.get(v) ?? v }));
  }, [options, values]);

  const handleBlur = (e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setIsOpen(false);
      setQuery("");
    }
  };

  const handleToggle = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onChange(values.filter((v) => v !== optionValue));
    } else {
      onChange([...values, optionValue]);
    }
  };

  const handleRemove = (optionValue: string) => {
    onChange(values.filter((v) => v !== optionValue));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;
    if (e.key === "Backspace" && !query && values.length > 0) {
      onChange(values.slice(0, -1));
    }
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  const handleInputClick = () => {
    if (!disabled) setIsOpen(true);
  };

  // 외부 클릭 감지 — onBlur 만으로는 트리거 빈 영역 클릭 후 비포커스 요소 클릭 시 닫히지 않는
  // 엣지 케이스가 있어 document mousedown 으로 이중 가드. isOpen=true 일 때만 리스너 등록.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full min-w-[70px] ${className}`}
      onBlur={handleBlur}
    >
      {/* 트리거 영역 */}
      <div
        onClick={handleInputClick}
        className={`flex flex-wrap items-center gap-1.5 w-full min-h-[42px] px-3 py-1.5 border rounded-[4px] transition-colors duration-150 ${
          disabled
            ? "bg-[#F5F5F5] border-[#EBEBEB] cursor-not-allowed"
            : "bg-white border-[#EBEBEB] cursor-text hover:border-[#D1D1D1]"
        } ${isOpen ? "border-[#1060B4]" : ""}`}
      >
        {/* 선택된 칩들 */}
        {selectedLabels.map((item) => (
          <span
            key={item.value}
            className="flex items-center gap-1 max-w-full h-[26px] px-2 bg-[#EDF4FB] rounded-[4px] font-['Noto_Sans_JP'] text-[12px] leading-[1.5] text-[#1060B4]"
          >
            <span className="truncate max-w-[160px]">{item.label}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(item.value);
                }}
                className="flex items-center justify-center size-[14px] shrink-0 rounded-full hover:bg-[#D0E2F3] transition-colors"
                aria-label={`${item.label}を削除`}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1L7 7M7 1L1 7" stroke="#1060B4" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </span>
        ))}

        {/* 검색 입력 */}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
            placeholder={values.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[60px] h-[26px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] placeholder:text-[#AAAAAA] outline-none bg-transparent"
          />
        )}

        {/* placeholder — disabled 시 칩이 없으면 표시 */}
        {disabled && values.length === 0 && (
          <span className="font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#AAAAAA]">
            {placeholder}
          </span>
        )}

        {/* 화살표 아이콘 — 클릭 시 드롭다운 토글 (입력창 클릭은 항상 열기만, 토글은 화살표로 분리) */}
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          className="flex items-center justify-center shrink-0 ml-auto"
          aria-label={isOpen ? "閉じる" : "開く"}
        >
          <Image
            src="/asset/images/common/select_arr.svg"
            alt=""
            width={24}
            height={24}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${disabled ? "opacity-50" : ""}`}
          />
        </button>
      </div>

      {/* 드롭다운 */}
      {!disabled && (
        <div
          className={`absolute top-full left-0 z-10 w-full mt-1 bg-white border border-[#EBEBEB] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-[240px] overflow-y-auto transition-all duration-200 origin-top ${
            isOpen
              ? "opacity-100 scale-y-100 visible"
              : "opacity-0 scale-y-95 invisible"
          }`}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-[40px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#AAAAAA]">
              該当する項目がありません
            </div>
          ) : (
            filtered.map((option) => {
              const isSelected = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleToggle(option.value)}
                  className={`flex items-center gap-2 w-full px-4 h-[40px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-left transition-colors duration-100 ${
                    isSelected
                      ? "bg-[#EDF4FB] text-[#1060B4]"
                      : "text-[#101010] hover:bg-[#F5F5F5]"
                  }`}
                >
                  {/* 체크 표시 */}
                  <span className={`flex items-center justify-center size-[16px] shrink-0 border rounded-[3px] transition-colors ${
                    isSelected ? "bg-[#1060B4] border-[#1060B4]" : "border-[#CCCCCC]"
                  }`}>
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
