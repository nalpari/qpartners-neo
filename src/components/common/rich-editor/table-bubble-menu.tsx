"use client";

import { BubbleMenu, type Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";

export interface TableBubbleMenuProps {
  editor: Editor;
}

/**
 * 표 셀 안에 커서가 있을 때만 표 위쪽에 노출되는 컨텍스트 툴바.
 * 행/열 추가·삭제 + 표 삭제만 제공 (병합/분할은 별도 작업).
 */
export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  const t = editorI18n.tableMenu;

  const btn =
    "flex items-center justify-center w-9 h-9 rounded transition-colors text-[12px] text-[#101010] bg-transparent hover:bg-[#FAFAFA]";
  const divider = <div className="w-px h-5 bg-[#EBEBEB] mx-1" aria-hidden="true" />;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBubbleMenu"
      shouldShow={({ editor: ed }) => ed.isEditable && ed.isActive("table")}
      tippyOptions={{ placement: "top", offset: [0, 8] }}
    >
      <div
        role="toolbar"
        aria-label={editorI18n.ariaLabels.tableMenu}
        className="flex items-center gap-1 px-2 py-1 bg-white border border-[#EBEBEB] rounded-[6px] shadow-md font-['Noto_Sans_JP']"
      >
        <button
          type="button"
          aria-label={t.rowAddBefore}
          title={t.rowAddBefore}
          className={btn}
          onClick={() => editor.chain().focus().addRowBefore().run()}
        >
          ⬆行
        </button>
        <button
          type="button"
          aria-label={t.rowAddAfter}
          title={t.rowAddAfter}
          className={btn}
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          ⬇行
        </button>
        <button
          type="button"
          aria-label={t.rowDelete}
          title={t.rowDelete}
          className={btn}
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          ✕行
        </button>
        {divider}
        <button
          type="button"
          aria-label={t.colAddBefore}
          title={t.colAddBefore}
          className={btn}
          onClick={() => editor.chain().focus().addColumnBefore().run()}
        >
          ⬅列
        </button>
        <button
          type="button"
          aria-label={t.colAddAfter}
          title={t.colAddAfter}
          className={btn}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          ➡列
        </button>
        <button
          type="button"
          aria-label={t.colDelete}
          title={t.colDelete}
          className={btn}
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          ✕列
        </button>
        {divider}
        <button
          type="button"
          aria-label={t.deleteTable}
          title={t.deleteTable}
          className={btn}
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          🗑
        </button>
      </div>
    </BubbleMenu>
  );
}

export default TableBubbleMenu;
