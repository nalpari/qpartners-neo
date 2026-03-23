"use client";

import { InputBox } from "@/components/common";

interface ContentsFormEditorProps {
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
}

export function ContentsFormEditor({
  title,
  onTitleChange,
  content,
  onContentChange,
}: ContentsFormEditorProps) {
  return (
    <>
      {/* 제목 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[34px] w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-bold text-[16px] leading-[1.5] text-[#333] mb-5">
          タイトル
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <InputBox
          value={title}
          onChange={onTitleChange}
          placeholder="タイトルを入力してください"
        />
      </section>

      {/* 내용 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[34px] w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-bold text-[16px] leading-[1.5] text-[#333] mb-5">
          内容
          <span className="text-[#FF1A1A]">*</span>
        </h2>
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="内容を入力してください"
          aria-label="内容を入力"
          className="w-full min-h-[300px] px-4 py-4 border border-[#EBEBEB] rounded-[6px] font-['Noto_Sans_JP'] text-[14px] leading-[1.8] text-[#101010] placeholder:text-[#AAAAAA] bg-white outline-none resize-y transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]"
        />
      </section>
    </>
  );
}
