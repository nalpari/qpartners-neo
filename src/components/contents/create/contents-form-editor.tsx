"use client";

import { InputBox } from "@/components/common";
import { BlockEditorLoader } from "@/components/common/block-editor";

interface ContentsFormEditorProps {
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
  onContentParseError?: (error: unknown) => void;
}

export function ContentsFormEditor({
  title,
  onTitleChange,
  content,
  onContentChange,
  onContentParseError,
}: ContentsFormEditorProps) {
  return (
    <>
      {/* 제목 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          タイトル
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <InputBox
          value={title}
          onChange={onTitleChange}
          placeholder="タイトルを入力してください"
        />
      </section>

      {/* 内容 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          内容
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <BlockEditorLoader
          defaultValue={content}
          onChange={onContentChange}
          onParseError={onContentParseError}
          ariaLabel="内容を入力"
          placeholder="内容を入力してください"
        />
      </section>
    </>
  );
}
