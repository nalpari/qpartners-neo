"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { type Editor } from "@tiptap/react";
import { editorI18n } from "./editor-i18n";
import { InsertTablePopover } from "./insert-table-popover";
import { ColorPopover } from "./color-popover";
import { HIGHLIGHT_PALETTE, TEXT_COLOR_PALETTE } from "./editor-colors";
import { FONT_SIZE_OPTIONS } from "./font-size";

export interface EditorToolbarProps {
  editor: Editor;
  /** G5 画像 버튼 클릭 시 호출 — 호출자가 숨겨진 file input을 트리거한다. */
  onImageRequest: () => void;
  /** HTML 소스 모드 활성 여부 — true면 HTML 버튼 외 나머지 컨트롤을 비활성화한다. */
  htmlSourceMode: boolean;
  /** G7 HTML 버튼 클릭 시 호출 — 소스 모드 진입/이탈 토글은 호출자가 담당한다. */
  onToggleHtmlSource: () => void;
}

/**
 * 상단 고정 툴바.
 * 그룹 구성(스펙 §11.2):
 *   G1 블록 타입 드롭다운 / G2 인라인 / G3 리스트 / G4 블록 / G5 삽입 / G6 히스토리
 * 좌측 블록 핸들·BubbleMenu는 사용하지 않음 (스펙 §3.4).
 */
export function EditorToolbar({
  editor,
  onImageRequest,
  htmlSourceMode,
  onToggleHtmlSource,
}: EditorToolbarProps) {
  const t = editorI18n.toolbar;
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const tableButtonRef = useRef<HTMLButtonElement>(null);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const textColorButtonRef = useRef<HTMLButtonElement>(null);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const highlightButtonRef = useRef<HTMLButtonElement>(null);

  const activeTextColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const activeHighlight =
    (editor.getAttributes("highlight").color as string | undefined) ?? null;

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

  // 폰트 사이즈 드롭다운은 React Compiler 메모이제이션과 getAttributes의 selection
  // 가시성 차이로 인해 단순 계산식만으로는 갱신이 누락된다.
  //   - useSyncExternalStore로 transaction/selectionUpdate를 명시적으로 구독해 리렌더 보장
  //   - selection의 active marks를 직접 검사하고 storedMarks fallback도 함께 확인
  const subscribeEditor = useCallback(
    (cb: () => void) => {
      editor.on("transaction", cb);
      editor.on("selectionUpdate", cb);
      return () => {
        editor.off("transaction", cb);
        editor.off("selectionUpdate", cb);
      };
    },
    [editor],
  );
  const readFontSize = useCallback(() => {
    const textStyleType = editor.schema.marks.textStyle;
    if (!textStyleType) return "";
    const { selection, storedMarks } = editor.state;
    const activeMark = selection.$from
      .marks()
      .find((m) => m.type === textStyleType);
    const activeFontSizeAttr = activeMark?.attrs.fontSize;
    if (typeof activeFontSizeAttr === "string") return activeFontSizeAttr;
    const stored = storedMarks?.find((m) => m.type === textStyleType);
    const storedFontSizeAttr = stored?.attrs.fontSize;
    return typeof storedFontSizeAttr === "string" ? storedFontSizeAttr : "";
  }, [editor]);
  const activeFontSize = useSyncExternalStore(
    subscribeEditor,
    readFontSize,
    () => "",
  );

  const setFontSize = (value: string) => {
    if (!value) editor.chain().focus().unsetFontSize().run();
    else editor.chain().focus().setFontSize(value).run();
  };

  const isEditable = editor.isEditable && !htmlSourceMode;

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
      className="flex items-center gap-1 px-2 py-1 border-b border-[#EBEBEB] flex-nowrap overflow-x-auto whitespace-nowrap [&>*]:shrink-0 font-['Noto_Sans_JP']"
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

      {/* G1.5 — 폰트 사이즈 드롭다운 */}
      <select
        aria-label={t.fontSize}
        value={activeFontSize}
        onChange={(e) => setFontSize(e.target.value)}
        disabled={!isEditable}
        className="h-9 px-2 rounded border border-[#EBEBEB] bg-white text-[13px] text-[#101010] disabled:opacity-40"
      >
        <option value="">{t.fontSizeDefault}</option>
        {FONT_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size.replace("px", "")}
          </option>
        ))}
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

      {/* G2.5 — 문자 색상 */}
      <div className="relative">
        <button
          ref={textColorButtonRef}
          type="button"
          aria-label={t.textColor}
          title={t.textColor}
          aria-haspopup="dialog"
          aria-expanded={textColorOpen}
          className={btn(textColorOpen || !!activeTextColor)}
          onClick={() => setTextColorOpen((o) => !o)}
          disabled={!isEditable}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="text-[12px] font-bold">A</span>
            <span
              className="block w-3 h-[3px] mt-[1px] rounded-[1px]"
              style={{ backgroundColor: activeTextColor ?? "#101010" }}
              aria-hidden="true"
            />
          </span>
        </button>
        {textColorOpen && (
          <ColorPopover
            onClose={() => setTextColorOpen(false)}
            triggerRef={textColorButtonRef}
            title={t.textColor}
            resetLabel={t.textColorReset}
            palette={TEXT_COLOR_PALETTE}
            activeValue={activeTextColor}
            onSelect={(v) => editor.chain().focus().setColor(v).run()}
            onReset={() => editor.chain().focus().unsetColor().run()}
          />
        )}
      </div>

      {/* G2.6 — 하이라이트 */}
      <div className="relative">
        <button
          ref={highlightButtonRef}
          type="button"
          aria-label={t.highlight}
          title={t.highlight}
          aria-haspopup="dialog"
          aria-expanded={highlightOpen}
          className={btn(highlightOpen || editor.isActive("highlight"))}
          onClick={() => setHighlightOpen((o) => !o)}
          disabled={!isEditable}
        >
          <span
            className="inline-block px-[3px] text-[12px] font-bold rounded-[2px]"
            style={{ backgroundColor: activeHighlight ?? "#FFF3BF" }}
          >
            H
          </span>
        </button>
        {highlightOpen && (
          <ColorPopover
            onClose={() => setHighlightOpen(false)}
            triggerRef={highlightButtonRef}
            title={t.highlight}
            resetLabel={t.highlightReset}
            palette={HIGHLIGHT_PALETTE}
            activeValue={activeHighlight}
            onSelect={(v) => editor.chain().focus().setHighlight({ color: v }).run()}
            onReset={() => editor.chain().focus().unsetHighlight().run()}
          />
        )}
      </div>

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
        {tablePopoverOpen && (
          <InsertTablePopover
            editor={editor}
            onClose={() => setTablePopoverOpen(false)}
            triggerRef={tableButtonRef}
          />
        )}
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

      {divider}

      {/* G7 — HTML 소스 모드 토글. 다른 버튼과 달리 소스 모드 중에도 클릭 가능해야 이탈할 수 있다. */}
      <button
        type="button"
        aria-label={t.htmlSource}
        title={t.htmlSource}
        aria-pressed={htmlSourceMode}
        disabled={!editor.isEditable}
        className={`${btnBase} ${
          htmlSourceMode ? "bg-[#F4F4F4]" : "bg-transparent hover:bg-[#FAFAFA]"
        } ${!editor.isEditable ? "opacity-40 pointer-events-none" : ""}`}
        onClick={onToggleHtmlSource}
      >
        <span className="font-mono text-[11px] font-bold">HTML</span>
      </button>
    </div>
  );
}
