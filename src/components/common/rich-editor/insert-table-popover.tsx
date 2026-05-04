"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";

const MAX_ROWS = 10;
const MAX_COLS = 10;

export interface InsertTablePopoverProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
  /** popover 외부 클릭으로 닫을 때 제외할 트리거 요소 — 토글 버튼이 다시 닫히지 않도록 */
  triggerRef?: RefObject<HTMLElement | null>;
}

/**
 * 툴바 ▦ 버튼이 띄우는 hover 그리드.
 * 좌상단부터 (r+1) × (c+1) 영역을 하이라이트하며 클릭 시 그 크기로 표 삽입.
 * 부모가 open=false 시 unmount해 hover state가 다음 표시에 남지 않도록 한다.
 */
export function InsertTablePopover({
  editor,
  open,
  onClose,
  triggerRef,
}: InsertTablePopoverProps) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
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

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={editorI18n.tableInsert.sizeHint}
      className="absolute top-full left-0 mt-1 z-20 bg-white border border-[#EBEBEB] rounded-[6px] shadow-md p-3 font-['Noto_Sans_JP']"
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
    </div>
  );
}

export default InsertTablePopover;
