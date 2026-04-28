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
  defaultValue,
  onChange,
  onParseError,
  placeholder,
  editable = true,
  ariaLabel,
}: BlockEditorProps) {
  const editor = useCreateBlockNote({
    schema: allowedBlocksSchema,
    dictionary: locales.ja,
  });

  // 마운트 시점의 defaultValue만 캡처 — 이후는 BlockNote 내부 상태가 진실의 원천.
  const initialValueRef = useRef(defaultValue);

  // onParseError를 ref로 잡아 마운트 effect deps에 넣지 않는다 — 부모가 매 렌더마다 새 함수를 넘겨도 본문 재파싱이 일어나지 않게 한다.
  const onParseErrorRef = useRef(onParseError);
  useEffect(() => {
    onParseErrorRef.current = onParseError;
  }, [onParseError]);

  // 마운트 단계에서 BlockNote가 내부 normalize로 자동 emit하는 onChange를 부모로 전파하지 않기 위한 가드.
  // 초기 replaceBlocks가 동기 listener를 트리거하므로 effect 마지막에 플래그를 세운다.
  const isMountedRef = useRef(false);

  useEffect(() => {
    const html = prepareBodyForEditor(initialValueRef.current);
    if (html) {
      try {
        const blocks = editor.tryParseHTMLToBlocks(html);
        editor.replaceBlocks(editor.document, blocks);
      } catch (error: unknown) {
        // 비정상 HTML(레거시 본문, 예상 외 구조)로 파싱이 실패하면 에디터가 빈 상태로 시작한다.
        // 호출자에게 알려 사용자에게 데이터 손실 가능성을 안내해야 한다.
        console.error("[BlockEditor] 초기 본문 파싱 실패:", error);
        onParseErrorRef.current?.(error);
      }
    }
    isMountedRef.current = true;
  }, [editor]);

  useEditorChange((e) => {
    if (!isMountedRef.current) return;
    try {
      const html = e.blocksToFullHTML(e.document);
      onChange(html);
    } catch (error: unknown) {
      // 한 번의 콜백 실패가 BlockNote listener loop를 침묵시키지 않도록 가둔다.
      console.error("[BlockEditor] onChange 처리 실패:", error);
    }
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
