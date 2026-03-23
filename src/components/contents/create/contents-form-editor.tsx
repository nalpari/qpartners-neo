"use client";

import { InputBox, Radio } from "@/components/common";

const RESOURCE_TYPE_OPTIONS = [
  { value: "session", label: "セッション/メニュー" },
  { value: "internal", label: "資料禁止（社内用）" },
  { value: "contents", label: "コンテンツ" },
  { value: "bellik", label: "ベリク1.7（期待）" },
  { value: "media", label: "マスコミ" },
];

interface ContentsFormEditorProps {
  resourceType: string;
  onResourceTypeChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
}

export function ContentsFormEditor({
  resourceType,
  onResourceTypeChange,
  title,
  onTitleChange,
  content,
  onContentChange,
}: ContentsFormEditorProps) {
  return (
    <>
      {/* 자료유형 섹션 (FR-10) */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          資料タイプ
        </h2>
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2">
          {RESOURCE_TYPE_OPTIONS.map((opt) => (
            <Radio
              key={opt.value}
              name="resourceType"
              value={opt.value}
              checked={resourceType === opt.value}
              onChange={() => onResourceTypeChange(opt.value)}
              label={opt.label}
            />
          ))}
        </div>
      </section>

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

      {/* 내용 섹션 */}
      <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
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
