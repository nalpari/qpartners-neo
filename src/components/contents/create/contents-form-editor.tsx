"use client";

import { InputBox } from "@/components/common";
import { RichEditorLoader } from "@/components/common/rich-editor";

interface ContentsFormEditorProps {
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
  onContentParseError?: (error: unknown) => void;
  onContentUploadError?: (error: unknown) => void;
}

export function ContentsFormEditor({
  title,
  onTitleChange,
  content,
  onContentChange,
  onContentParseError,
  onContentUploadError,
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
        {/* 内容은 임의 입력 — createContentSchema/updateContentSchema 의 body 도 optional 이라
            서버·클라이언트 양쪽에서 빈 본문을 허용한다. */}
        <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          内容
        </h2>
        <RichEditorLoader
          defaultValue={content}
          onChange={onContentChange}
          onParseError={onContentParseError}
          onUploadError={onContentUploadError}
          ariaLabel="内容を入力"
          placeholder="内容を入力してください"
          // 콘텐츠 본문에서만 YouTube 임베드 허용 — 대량메일 폼(bulk-mail-form-content)은
          // 저장 시 서버 sanitize 가 iframe 을 제거하므로 켜지 않는다.
          allowYoutubeEmbed
        />
      </section>
    </>
  );
}
