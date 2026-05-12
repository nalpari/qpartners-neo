"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { ColorOption } from "./editor-colors";

const POPOVER_WIDTH = 200;
const VIEWPORT_MARGIN = 8;

export interface ColorPopoverProps {
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  title: string;
  resetLabel: string;
  palette: readonly ColorOption[];
  activeValue: string | null;
  onSelect: (value: string) => void;
  onReset: () => void;
}

/**
 * 색상 선택 팝오버. 트리거 버튼의 viewport 좌표 바로 아래에 portal로 렌더링한다.
 * - createPortal로 document.body에 마운트해 툴바 overflow 클리핑을 회피한다.
 * - 위치는 useLayoutEffect에서 DOM에 직접 적용(setState 없음) — React Compiler 룰 회피.
 * - 측정 전에는 visibility:hidden으로 시작해 잘못된 좌표가 화면에 잠깐 노출되지 않게 한다.
 */
export function ColorPopover({
  onClose,
  triggerRef,
  title,
  resetLabel,
  palette,
  activeValue,
  onSelect,
  onReset,
}: ColorPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const trigger = triggerRef.current;
    if (!container || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const left = clamp(
      rect.left,
      VIEWPORT_MARGIN,
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
    );
    container.style.top = `${rect.bottom + 4}px`;
    container.style.left = `${left}px`;
    container.style.visibility = "visible";
  }, [triggerRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const target = e.target as Node;
      if (el.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose, triggerRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label={title}
      className="fixed z-50 invisible bg-white border border-[#EBEBEB] rounded-[6px] shadow-md p-3 font-['Noto_Sans_JP']"
      style={{ width: POPOVER_WIDTH }}
    >
      <div className="mb-2 text-[12px] text-[#505050] select-none">{title}</div>
      <div className="grid grid-cols-5 gap-[6px]">
        {palette.map((c) => {
          const active = activeValue?.toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.key}
              type="button"
              aria-label={c.label}
              title={c.label}
              onClick={() => {
                onSelect(c.value);
                onClose();
              }}
              className={`w-6 h-6 rounded border transition-shadow ${
                active ? "border-[#101010] shadow-[0_0_0_2px_#101010_inset]" : "border-[#EBEBEB] hover:border-[#101010]"
              }`}
              style={{ backgroundColor: c.value }}
            />
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          onReset();
          onClose();
        }}
        className="mt-3 w-full h-7 text-[12px] text-[#505050] border border-[#EBEBEB] rounded hover:bg-[#FAFAFA]"
      >
        {resetLabel}
      </button>
    </div>,
    document.body,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
