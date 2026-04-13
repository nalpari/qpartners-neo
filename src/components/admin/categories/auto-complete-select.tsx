"use client";

// Design Ref: §4.4 — 상위 카테고리 자동완성 셀렉트

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface AutoCompleteOption {
  label: string;
  value: string;
}

interface AutoCompleteSelectProps {
  options: AutoCompleteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function AutoCompleteSelect({
  options,
  value,
  onChange,
  placeholder = "カテゴリ名で検索",
  disabled = false,
}: AutoCompleteSelectProps) {
  const selectedOption = options.find((opt) => opt.value === value);
  // value 변경 시 searchText를 동기화 — useEffect + setState 대신 파생 값으로 처리
  // React Compiler 규칙: set-state-in-effect 금지
  const displayText = selectedOption?.label ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 실제 표시 텍스트: 검색 중이면 searchText, 아니면 선택된 label
  const inputValue = isSearching ? searchText : displayText;

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsSearching(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const filterText = isSearching ? searchText : "";
  const filteredOptions = isOpen
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(filterText.toLowerCase()),
      )
    : [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setIsSearching(true);
    if (!isOpen) setIsOpen(true);
  };

  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
      setIsSearching(true);
      setSearchText("");
    }
  };

  const handleSelect = (opt: AutoCompleteOption) => {
    onChange(opt.value);
    setIsSearching(false);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setIsSearching(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex items-center gap-2 w-full h-[42px] px-4 border rounded-[4px] transition-colors duration-150 ${
          disabled
            ? "bg-[#F5F5F5] border-[#EBEBEB] cursor-not-allowed"
            : "bg-white border-[#EBEBEB] hover:border-[#D1D1D1]"
        } ${isOpen ? "border-[#1060B4]" : ""}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={`flex-1 font-['Noto_Sans_JP'] text-sm leading-[1.5] outline-none bg-transparent ${
            disabled ? "text-[#AAAAAA] cursor-not-allowed" : "text-[#101010]"
          }`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 size-[20px] flex items-center justify-center text-[#AAAAAA] hover:text-[#101010] transition-colors"
            aria-label="選択解除"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <Image
          src="/asset/images/common/select_arr.svg"
          alt=""
          width={24}
          height={24}
          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${disabled ? "opacity-50" : ""}`}
        />
      </div>

      {/* 드롭다운 */}
      {!disabled && (
        <div
          className={`absolute top-full left-0 z-10 w-full mt-1 bg-white border border-[#EBEBEB] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-[240px] overflow-y-auto transition-all duration-200 origin-top ${
            isOpen && filteredOptions.length > 0
              ? "opacity-100 scale-y-100 visible"
              : "opacity-0 scale-y-95 invisible"
          }`}
        >
          {filteredOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt)}
              className={`flex items-center w-full px-4 h-[40px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-left transition-colors duration-100 ${
                opt.value === value
                  ? "bg-[#EDF4FB] text-[#1060B4]"
                  : "text-[#101010] hover:bg-[#F5F5F5]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
