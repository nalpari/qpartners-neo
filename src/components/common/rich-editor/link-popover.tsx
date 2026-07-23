"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";

const POPOVER_WIDTH = 280;
const VIEWPORT_MARGIN = 8;
// editor-extensions.ts protocols(https?/mailto)와 일치. sanitize-html.ts는 # 도 허용하나
// 팝오버 입력에서는 앵커 링크를 지원하지 않으므로 제외.
const SAFE_HREF_PATTERN = /^(https?:|mailto:)/i;

export interface LinkPopoverProps {
  editor: Editor;
  onClose: () => void;
  /** popover 외부 클릭으로 닫을 때 제외할 트리거 요소 */
  triggerRef: RefObject<HTMLElement | null>;
}

/**
 * 툴바 🔗 버튼이 띄우는 링크 입력 팝오버.
 * - 커서가 기존 링크 위에 있으면 href 를 프리필하고 "リンク解除" 버튼을 노출한다.
 * - 선택 영역이 없고 기존 링크 위도 아니면(적용 대상 불명) 안내만 표시하고 입력을 막는다.
 * - InsertTablePopover/ColorPopover 와 동일하게 portal + fixed 좌표로 렌더링한다.
 */
export function LinkPopover({ editor, onClose, triggerRef }: LinkPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = editorI18n.linkPopover;

  // 열리는 시점의 선택 상태를 고정 캡처 — 팝오버가 떠있는 동안 에디터 선택이 바뀌는 경우는
  // 다루지 않는다(입력창에 포커스가 가 있는 한 에디터 선택은 유지됨).
  const [isOnLink] = useState(() => editor.isActive("link"));
  const [canApply] = useState(() => !editor.state.selection.empty || editor.isActive("link"));
  const [url, setUrl] = useState(() => {
    const href = editor.getAttributes("link").href;
    return typeof href === "string" ? href : "";
  });
  // 기존 링크 편집 시엔 실제 현재 상태(target)를 반영하고, 신규 링크는 항상 체크(새 탭)로 시작한다.
  const [newTab, setNewTab] = useState(() =>
    isOnLink ? editor.getAttributes("link").target === "_blank" : true,
  );
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const trigger = triggerRef.current;
    if (!container || !trigger) {
      console.warn("[LinkPopover] useLayoutEffect: ref 미연결 상태로 팝오버 닫힘", {
        container: !!container,
        trigger: !!trigger,
      });
      onClose();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const left = clamp(
      rect.left,
      VIEWPORT_MARGIN,
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
    );
    container.style.top = `${rect.bottom + 4}px`;
    container.style.left = `${left}px`;
    container.style.visibility = "visible";
  }, [triggerRef, onClose]);

  useEffect(() => {
    if (canApply) inputRef.current?.focus();
  }, [canApply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (!(e.target instanceof Node)) return;
      if (el.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
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

  const handleApply = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t.errorEmpty);
      return;
    }
    if (!SAFE_HREF_PATTERN.test(trimmed)) {
      setError(t.errorScheme);
      return;
    }
    // extendMarkRange: 커서가 기존 링크 위(선택 없음)여도 그 링크 전체 범위에 적용.
    // target 은 체크박스 값 그대로 — 새 탭이면 "_blank", 아니면 null(속성 미부여, 현재 창에서 이동).
    const applied = editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: trimmed, target: newTab ? "_blank" : null })
      .run();
    if (!applied) { setError(t.errorApplyFailed); return; }
    onClose();
  };

  const handleRemove = () => {
    const removed = editor.chain().focus().extendMarkRange("link").unsetLink().run();
    if (!removed) { setError(t.errorRemoveFailed); return; }
    onClose();
  };

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      className="fixed z-50 invisible bg-white border border-[#EBEBEB] rounded-[6px] shadow-md p-3 font-['Noto_Sans_JP']"
      style={{ width: POPOVER_WIDTH }}
    >
      <div className="mb-2 text-[12px] text-[#505050] select-none">{t.title}</div>
      {!canApply ? (
        <p className="text-[12px] text-[#FF1A1A]">{t.errorNoSelection}</p>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder={t.placeholder}
            aria-describedby={error ? "link-popover-error" : undefined}
            aria-invalid={error ? true : undefined}
            className="w-full h-8 px-2 text-[13px] border border-[#EBEBEB] rounded focus:outline-none focus:border-[#101010]"
          />
          {error && <p id="link-popover-error" className="mt-1 text-[12px] text-[#FF1A1A]">{error}</p>}
          <label className="flex items-center gap-2 mt-2 text-[12px] text-[#505050] select-none">
            <input
              type="checkbox"
              checked={newTab}
              onChange={(e) => setNewTab(e.target.checked)}
            />
            {t.newTab}
          </label>
          <div className="flex gap-2 mt-3">
            {isOnLink && (
              <button
                type="button"
                onClick={handleRemove}
                className="h-8 px-3 text-[12px] text-[#505050] border border-[#EBEBEB] rounded hover:bg-[#FAFAFA]"
              >
                {t.remove}
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 h-8 text-[12px] text-white bg-[#101010] rounded hover:bg-[#383838]"
            >
              {t.apply}
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// max(min, max): min > max(좁은 뷰포트 등)일 때 min 쪽으로 클램프해 음수 left를 방지한다.
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default LinkPopover;
