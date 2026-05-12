"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ColorOption } from "./editor-colors";

export interface ColorPopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  title: string;
  resetLabel: string;
  palette: readonly ColorOption[];
  activeValue: string | null;
  onSelect: (value: string) => void;
  onReset: () => void;
}

export function ColorPopover({
  open,
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const target = e.target as Node;
      if (el.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={title}
      className="absolute top-full left-0 mt-1 z-20 bg-white border border-[#EBEBEB] rounded-[6px] shadow-md p-3 font-['Noto_Sans_JP']"
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
    </div>
  );
}
