"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";

/**
 * 시(hour) 단위 시각 선택 — 드롭다운 목록에서 고르거나 직접 타이핑할 수 있는 콤보박스.
 *
 * 분 단위는 제공하지 않는다 — 게시기간 요구사항이 시 단위까지다.
 * 값은 항상 0~23 정수이며 "미지정" 상태는 없다. 짝이 되는 날짜가 비어 있을 때는
 * 호출부가 `disabled` 로 잠근다.
 *
 * 구조는 `multi-select-combobox.tsx` 를 단일 선택으로 줄인 것 —
 * 열림/닫힘, 외부 클릭 가드, 드롭다운 패널 스타일을 프로젝트 공통 셀렉트와 맞춘다.
 * (네이티브 `<datalist>` 는 브라우저마다 펼침 모양이 제각각이라 쓰지 않는다)
 */

/**
 * 0~23 → "13時".
 *
 * 분을 다루지 않으므로 "13:00" 처럼 항상 `:00` 이 붙는 표기는 군더더기다.
 * 0 패딩도 하지 않는다 — "09時" 보다 "9時" 가 읽기 자연스럽다.
 */
export function formatHour(hour: number): string {
  return `${hour}時`;
}

/**
 * 자유 입력 문자열 → 0~23 시. 해석 불가하면 null (호출부가 이전 값으로 되돌린다).
 *
 * "9", "9時", "09", "9:00", "14:30"(분 버림), "0900" 을 모두 받는다.
 * 표기가 "13時" 로 바뀐 뒤에도 콜론 형식을 계속 받는 이유는, 시각 입력에 "13:00" 을
 * 치는 습관이 흔하기 때문이다. 「時」는 숫자만 남기는 단계에서 자연히 떨어진다.
 *
 * 콜론을 먼저 떼는 게 핵심 — 숫자만 남기고 자릿수로 판단하면 "9:00" 이 "900" 이 되어
 * 앞 2자리 "90" 으로 잘못 읽힌다. "930" 처럼 의도가 모호한 입력은 범위 밖으로
 * 떨어뜨려 거부한다 (잘못 확정하느니 되돌리는 편이 낫다).
 */
export function parseHour(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const colonIndex = trimmed.indexOf(":");
  const head = (colonIndex >= 0 ? trimmed.slice(0, colonIndex) : trimmed).replace(/\D/g, "");
  // 콜론 없는 4자리는 HHMM 으로 본다 ("0900" → 09시)
  const digits = colonIndex < 0 && head.length === 4 ? head.slice(0, 2) : head;
  if (!digits) return null;
  const hour = Number(digits);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface TimeSelectProps {
  /** 0~23 시 */
  value: number;
  onChange?: (hour: number) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function TimeSelect({
  value,
  onChange,
  disabled = false,
  className = "",
  ariaLabel = "時間を選択",
}: TimeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  // null = 편집 중 아님(확정값 표시). 문자열 = 타이핑 중인 원문.
  const [query, setQuery] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const display = query ?? formatHour(value);
  // 타이핑 중일 때만 후보를 좁힌다 — "9" 로 09시·19시가 함께 남는다.
  const filtered =
    query && query.trim()
      ? HOURS.filter((h) => formatHour(h).includes(query.trim()))
      : HOURS;

  const close = () => {
    setIsOpen(false);
    setQuery(null);
  };

  const commit = (hour: number) => {
    if (hour !== value) onChange?.(hour);
    close();
  };

  /** 타이핑한 원문을 확정 — 해석 실패 시 조용히 이전 값으로 되돌린다. */
  const commitQuery = () => {
    if (query === null) return close();
    const parsed = parseHour(query);
    if (parsed === null) return close();
    commit(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      commitQuery();
      return;
    }
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowDown" && !isOpen) setIsOpen(true);
  };

  // 외부 클릭 감지 — onBlur 만으로는 비포커스 요소 클릭 시 닫히지 않는 엣지 케이스가 있어
  // document mousedown 으로 이중 가드 (multi-select-combobox 와 동일 정책).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 ${className}`}
      onBlur={(e) => {
        if (containerRef.current?.contains(e.relatedTarget)) return;
        commitQuery();
      }}
    >
      <div
        className={`flex items-center gap-1 w-full h-[44px] pl-3 pr-2 border rounded-[4px] transition-colors duration-150 ${
          disabled
            ? "bg-[#F5F5F5] border-[#E0E0E0] cursor-not-allowed"
            : "bg-white border-[#EBEBEB] hover:border-[#D1D1D1]"
        } ${isOpen ? "border-[#1060B4]" : ""}`}
      >
        <input
          type="text"
          inputMode="numeric"
          value={display}
          disabled={disabled}
          aria-label={ariaLabel}
          // 목록을 여닫는 입력이므로 combobox role 을 명시한다 —
          // input 의 기본 role(textbox)은 aria-expanded 를 지원하지 않는다.
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          // 포커스 시 전체 선택 — 바로 타이핑하면 기존 값에 이어붙지 않고 대체된다.
          onFocus={(e) => {
            setIsOpen(true);
            e.target.select();
          }}
          className={`flex-1 min-w-0 font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none ${
            disabled ? "text-[#AAAAAA] cursor-not-allowed" : "text-[#101010]"
          }`}
        />
        <button
          type="button"
          disabled={disabled}
          tabIndex={-1}
          onClick={() => !disabled && (isOpen ? close() : setIsOpen(true))}
          className={`flex items-center justify-center shrink-0 ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
          aria-label={isOpen ? "閉じる" : "開く"}
        >
          <Image
            src="/asset/images/common/select_arr.svg"
            alt=""
            width={20}
            height={20}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {!disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-full left-0 z-10 w-full mt-1 bg-white border border-[#EBEBEB] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-[240px] overflow-y-auto transition-all duration-200 origin-top ${
            isOpen
              ? "opacity-100 scale-y-100 visible"
              : "opacity-0 scale-y-95 invisible"
          }`}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-[40px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#AAAAAA]">
              該当なし
            </div>
          ) : (
            filtered.map((hour) => (
              <button
                key={hour}
                type="button"
                role="option"
                aria-selected={hour === value}
                // onClick 은 input 의 blur 뒤에 오므로, blur 확정이 선택을 덮어쓰지 않도록 mousedown 에서 처리.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(hour);
                }}
                className={`flex items-center w-full px-3 h-[40px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-left transition-colors duration-100 ${
                  hour === value
                    ? "bg-[#EDF4FB] text-[#1060B4]"
                    : "text-[#101010] hover:bg-[#F5F5F5]"
                }`}
              >
                {formatHour(hour)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
