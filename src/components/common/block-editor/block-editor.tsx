"use client";

import { useEffect, useRef } from "react";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import * as locales from "@blocknote/core/locales";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import { allowedBlocksSchema } from "@/lib/block-editor/allowed-blocks";
import { prepareBodyForEditor } from "@/lib/block-editor/prepare-body-for-editor";
import type { BlockEditorProps } from "./block-editor.types";

export function BlockEditor({
  value,
  onChange,
  placeholder,
  editable = true,
  ariaLabel,
}: BlockEditorProps) {
  const editor = useCreateBlockNote({
    schema: allowedBlocksSchema,
    dictionary: locales.ja,
  });

  // 마운트 시점의 value만 캡처 — 이후는 BlockNote 내부 상태가 진실의 원천.
  // value가 바뀌어 폼 reset이 필요한 경우는 부모에서 컴포넌트 트리를 리마운트한다.
  const initialValueRef = useRef(value);

  useEffect(() => {
    let cancelled = false;
    const html = prepareBodyForEditor(initialValueRef.current);
    if (!html) return;

    // tryParseHTMLToBlocks 는 이 버전(@blocknote/core@0.49)에서 동기 함수임.
    const blocks = editor.tryParseHTMLToBlocks(html);
    if (cancelled) return;
    editor.replaceBlocks(editor.document, blocks);

    return () => {
      cancelled = true;
    };
  }, [editor]);

  // blocksToFullHTML 는 이 버전(@blocknote/core@0.49)에서 동기 함수임.
  useEditorChange((e) => {
    const html = e.blocksToFullHTML(e.document);
    onChange(html);
  }, editor);

  return (
    <div
      aria-label={ariaLabel}
      className="w-full border border-[#EBEBEB] rounded-[6px] bg-white transition-colors duration-150 hover:border-[#D1D1D1] focus-within:border-[#101010]"
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        data-placeholder={placeholder}
      />
    </div>
  );
}

export default BlockEditor;
