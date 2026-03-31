"use client";

import { InputBox } from "@/components/common";

interface BulkMailFormTitleProps {
  title: string;
  onTitleChange: (value: string) => void;
  disabled: boolean;
}

export function BulkMailFormTitle({
  title,
  onTitleChange,
  disabled,
}: BulkMailFormTitleProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
        タイトル<span className="text-[#FF1A1A]">*</span>
      </h2>
      <InputBox
        value={title}
        onChange={onTitleChange}
        placeholder="タイトルを入力してください"
        readOnly={disabled}
      />
    </div>
  );
}

interface BulkMailFormBodyProps {
  content: string;
  onContentChange: (value: string) => void;
  disabled: boolean;
}

export function BulkMailFormBody({
  content,
  onContentChange,
  disabled,
}: BulkMailFormBodyProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
        内容<span className="text-[#FF1A1A]">*</span>
      </h2>
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="内容を入力してください"
        readOnly={disabled}
        className={`w-full min-h-[200px] p-4 border border-[#EAF0F6] rounded-[4px] resize-y font-['Noto_Sans_JP'] text-[14px] leading-[1.8] text-[#101010] outline-none transition-colors duration-150 placeholder:text-[#AAAAAA] ${
          disabled
            ? "bg-[#F5F5F5] cursor-not-allowed"
            : "bg-[#FDFEFE] hover:border-[#D1D1D1] focus:border-[#101010]"
        }`}
      />
    </div>
  );
}
