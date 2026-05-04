"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import api from "@/lib/axios";
import { prepareBodyForEditor } from "@/lib/rich-editor/prepare-body-for-editor";
import { buildExtensions } from "./editor-extensions";
import { EditorToolbar } from "./editor-toolbar";
import { editorI18n } from "./editor-i18n";
import type { RichEditorProps } from "./rich-editor.types";

export function RichEditor({
  defaultValue,
  onChange,
  onParseError,
  onUploadError,
  placeholder,
  editable = true,
  ariaLabel,
}: RichEditorProps) {
  // 부모가 매 렌더마다 새 함수를 넘겨도 extension이 재생성되지 않도록 ref로 잡는다.
  const onUploadErrorRef = useRef(onUploadError);
  const onParseErrorRef = useRef(onParseError);
  useEffect(() => {
    onUploadErrorRef.current = onUploadError;
  }, [onUploadError]);
  useEffect(() => {
    onParseErrorRef.current = onParseError;
  }, [onParseError]);

  // 마운트 시점의 defaultValue만 캡처 — 이후는 에디터 내부 상태가 진실의 원천.
  const initialValueRef = useRef(defaultValue);

  // 마운트 단계의 setContent로 인한 자동 emit을 부모로 전파하지 않기 위한 가드.
  const isMountedRef = useRef(false);

  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const uploadInlineImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post<{ data: { id: number; url: string } }>(
      "/inline-images",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data.data.url;
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: buildExtensions({
      placeholder,
      uploadInlineImage,
      onUploadError: (e) => onUploadErrorRef.current?.(e),
      onUploadingChange: setIsUploading,
      triggerImagePicker,
    }),
    onUpdate: ({ editor: ed }) => {
      if (!isMountedRef.current) return;
      try {
        const html = ed.getHTML();
        onChange(html);
      } catch (error: unknown) {
        // 한 번의 콜백 실패가 listener loop를 침묵시키지 않도록 가둔다.
        console.error("[RichEditor] onChange 처리 실패:", error);
      }
    },
  });

  // 초기 본문 주입 — 마운트 시 1회. 실패 시 onParseError로 부모에 알림.
  useEffect(() => {
    if (!editor) return;
    const html = prepareBodyForEditor(initialValueRef.current);
    if (html) {
      try {
        editor.commands.setContent(html, false);
      } catch (error: unknown) {
        // 비정상 HTML로 파싱 실패 시 빈 doc 으로 시작.
        console.error("[RichEditor] 초기 본문 파싱 실패:", error);
        onParseErrorRef.current?.(error);
      }
    }
    isMountedRef.current = true;
  }, [editor]);

  // editable prop 변화 반영
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // 툴바·슬래시 메뉴의 画像 버튼이 호출하는 file picker 결과 처리.
  const handleImagePickerChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능하게
    if (!file || !editor) return;
    setIsUploading(true);
    try {
      const url = await uploadInlineImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (error: unknown) {
      console.error("[RichEditor] inline image upload failed:", error);
      onUploadErrorRef.current?.(error);
    } finally {
      setIsUploading(false);
    }
  };

  if (!editor) return null;

  return (
    <div
      aria-label={ariaLabel ?? editorI18n.ariaLabels.editor}
      data-uploading={isUploading ? "true" : "false"}
      className="relative w-full min-h-[150px] border border-[#EBEBEB] rounded-[6px] bg-white transition-colors duration-150 hover:border-[#D1D1D1] focus-within:border-[#101010] overflow-hidden"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleImagePickerChange(e);
        }}
      />
      {/* 1px indeterminate progress bar — globals.css의 .rich-editor-progress 사용 */}
      <div
        aria-hidden="true"
        className={`absolute top-0 left-0 right-0 h-[1px] overflow-hidden pointer-events-none transition-opacity duration-150 ${
          isUploading ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="rich-editor-progress h-full bg-[#101010]" />
      </div>
      <EditorToolbar editor={editor} onImageRequest={triggerImagePicker} />
      <EditorContent
        editor={editor}
        className="px-4 py-3 prose prose-sm max-w-none font-['Noto_Sans_JP'] [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[120px]"
      />
    </div>
  );
}

export default RichEditor;
