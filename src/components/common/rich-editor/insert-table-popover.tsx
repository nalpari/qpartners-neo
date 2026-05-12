"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";

const MAX_ROWS = 10;
const MAX_COLS = 10;
const VIEWPORT_MARGIN = 8;
// 10 cols × 16px + 9 gaps × 2px + 좌우 padding 24 + 여유
const POPOVER_WIDTH = 220;

export interface InsertTablePopoverProps {
  editor: Editor;
  onClose: () => void;
  /** popover 외부 클릭으로 닫을 때 제외할 트리거 요소 */
  triggerRef: RefObject<HTMLElement | null>;
}

/**
 * 툴바 ▦ 버튼이 띄우는 hover 그리드.
 * portal + fixed로 body에 렌더링해 툴바 overflow 영향을 받지 않는다.
 * 좌표는 트리거 버튼 좌표 기준으로 useLayoutEffect에서 DOM에 직접 적용한다.
 */
export function InsertTablePopover({
  editor,
  onClose,
  triggerRef,
}: InsertTablePopoverProps) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
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

  const label = hover
    ? `${hover.r + 1} × ${hover.c + 1}`
    : editorI18n.tableInsert.sizeHint;

  const handlePick = (r: number, c: number) => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: r + 1, cols: c + 1, withHeaderRow: true })
      .run();
    onClose();
  };

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label={editorI18n.tableInsert.sizeHint}
      className="fixed z-50 invisible bg-white border border-[#EBEBEB] rounded-[6px] shadow-md p-3 font-['Noto_Sans_JP']"
    >
      <div className="mb-2 text-[12px] text-[#505050] select-none">{label}</div>
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 16px)` }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: MAX_ROWS }, (_, r) =>
          Array.from({ length: MAX_COLS }, (_, c) => {
            const active = hover ? r <= hover.r && c <= hover.c : false;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                aria-label={`${r + 1} × ${c + 1}`}
                onMouseEnter={() => setHover({ r, c })}
                onClick={() => handlePick(r, c)}
                className={`w-4 h-4 border border-[#EBEBEB] transition-colors ${
                  active ? "bg-[#101010]" : "bg-white hover:bg-[#FAFAFA]"
                }`}
              />
            );
          }),
        )}
      </div>
    </div>,
    document.body,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default InsertTablePopover;
