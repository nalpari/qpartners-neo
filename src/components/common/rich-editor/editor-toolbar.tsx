"use client";

import { useRef, useState } from "react";
import { type Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";
import { InsertTablePopover } from "./insert-table-popover";

export interface EditorToolbarProps {
  editor: Editor;
  /** G5 画像 버튼 클릭 시 호출 — 호출자가 숨겨진 file input을 트리거한다. */
  onImageRequest: () => void;
}

/**
 * 상단 고정 툴바.
 * 그룹 구성(스펙 §11.2):
 *   G1 블록 타입 드롭다운 / G2 인라인 / G3 리스트 / G4 블록 / G5 삽입 / G6 히스토리
 * 좌측 블록 핸들·BubbleMenu는 사용하지 않음 (스펙 §3.4).
 */
export function EditorToolbar({ editor, onImageRequest }: EditorToolbarProps) {
  const t = editorI18n.toolbar;
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const tableButtonRef = useRef<HTMLButtonElement>(null);

  const blockValue: "paragraph" | "h1" | "h2" | "h3" = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
    ? "h3"
    : "paragraph";

  const setBlock = (value: string) => {
    const chain = editor.chain().focus();
    if (value === "paragraph") chain.setParagraph().run();
    else if (value === "h1") chain.setHeading({ level: 1 }).run();
    else if (value === "h2") chain.setHeading({ level: 2 }).run();
    else if (value === "h3") chain.setHeading({ level: 3 }).run();
  };

  const isEditable = editor.isEditable;

  const btnBase =
    "flex items-center justify-center w-9 h-9 rounded transition-colors text-[14px] text-[#101010]";
  const btn = (active: boolean, disabled = false) =>
    `${btnBase} ${
      active ? "bg-[#F4F4F4]" : "bg-transparent hover:bg-[#FAFAFA]"
    } ${disabled || !isEditable ? "opacity-40 pointer-events-none" : ""}`;

  const divider = <div className="w-px h-5 bg-[#EBEBEB] mx-1" aria-hidden="true" />;

  return (
    <div
      role="toolbar"
      aria-label={editorI18n.ariaLabels.toolbar}
      className="flex items-center gap-1 px-2 py-1 border-b border-[#EBEBEB] flex-wrap font-['Noto_Sans_JP']"
    >
      {/* G1 — 블록 타입 드롭다운 */}
      <select
        aria-label={t.blockType}
        value={blockValue}
        onChange={(e) => setBlock(e.target.value)}
        disabled={!isEditable}
        className="h-9 px-2 rounded border border-[#EBEBEB] bg-white text-[13px] text-[#101010] disabled:opacity-40"
      >
        <option value="paragraph">{t.paragraph}</option>
        <option value="h1">{t.heading1}</option>
        <option value="h2">{t.heading2}</option>
        <option value="h3">{t.heading3}</option>
      </select>

      {divider}

      {/* G2 — 인라인 */}
      <button
        type="button"
        aria-label={t.bold}
        title={`${t.bold} (${t.shortcuts.bold})`}
        disabled={!isEditable}
        className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        aria-label={t.italic}
        title={`${t.italic} (${t.shortcuts.italic})`}
        disabled={!isEditable}
        className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </button>
      <button
        type="button"
        aria-label={t.strike}
        title={`${t.strike} (${t.shortcuts.strike})`}
        disabled={!isEditable}
        className={btn(editor.isActive("strike"))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </button>
      <button
        type="button"
        aria-label={t.inlineCode}
        title={`${t.inlineCode} (${t.shortcuts.inlineCode})`}
        disabled={!isEditable}
        className={btn(editor.isActive("code"))}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <span className="font-mono text-[12px]">{`</>`}</span>
      </button>

      {divider}

      {/* G3 — 리스트 */}
      <button
        type="button"
        aria-label={t.bulletList}
        title={t.bulletList}
        disabled={!isEditable}
        className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        ・
      </button>
      <button
        type="button"
        aria-label={t.orderedList}
        title={t.orderedList}
        disabled={!isEditable}
        className={btn(editor.isActive("orderedList"))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </button>

      {divider}

      {/* G4 — 블록 */}
      <button
        type="button"
        aria-label={t.blockquote}
        title={t.blockquote}
        disabled={!isEditable}
        className={btn(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>
      <button
        type="button"
        aria-label={t.codeBlock}
        title={t.codeBlock}
        disabled={!isEditable}
        className={btn(editor.isActive("codeBlock"))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <span className="font-mono text-[12px]">{`{ }`}</span>
      </button>

      {divider}

      {/* G5 — 삽입 */}
      <button
        type="button"
        aria-label={t.image}
        title={t.image}
        className={btn(false)}
        onClick={onImageRequest}
        disabled={!isEditable}
      >
        🖼
      </button>
      <div className="relative">
        <button
          ref={tableButtonRef}
          type="button"
          aria-label={t.table}
          title={t.table}
          aria-haspopup="dialog"
          aria-expanded={tablePopoverOpen}
          className={btn(tablePopoverOpen)}
          onClick={() => setTablePopoverOpen((o) => !o)}
          disabled={!isEditable}
        >
          ▦
        </button>
        <InsertTablePopover
          editor={editor}
          open={tablePopoverOpen}
          onClose={() => setTablePopoverOpen(false)}
          triggerRef={tableButtonRef}
        />
      </div>

      {divider}

      {/* G6 — 히스토리 */}
      <button
        type="button"
        aria-label={t.undo}
        title={`${t.undo} (${t.shortcuts.undo})`}
        className={btn(false, !editor.can().undo())}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!isEditable || !editor.can().undo()}
      >
        ↶
      </button>
      <button
        type="button"
        aria-label={t.redo}
        title={`${t.redo} (${t.shortcuts.redo})`}
        className={btn(false, !editor.can().redo())}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!isEditable || !editor.can().redo()}
      >
        ↷
      </button>
    </div>
  );
}
