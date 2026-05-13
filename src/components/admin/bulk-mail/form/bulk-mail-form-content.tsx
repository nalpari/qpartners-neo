"use client";

import { InputBox } from "@/components/common";
import { RichEditorLoader } from "@/components/common/rich-editor";
import { prepareBodyForRender } from "@/lib/rich-editor/prepare-body-for-render";
import { sanitizeContentHtml } from "@/lib/rich-editor/sanitize-html";
import type { FormMode } from "@/components/admin/bulk-mail/bulk-mail-types";

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
  mode: FormMode;
  content: string;
  onContentChange: (value: string) => void;
  disabled: boolean;
  onContentParseError?: (error: unknown) => void;
  onContentUploadError?: (error: unknown) => void;
}

export function BulkMailFormBody({
  mode,
  content,
  onContentChange,
  disabled,
  onContentParseError,
  onContentUploadError,
}: BulkMailFormBodyProps) {
  // detail 모드: 에디터에서 적용한 색상/굵기/폰트 사이즈 등이 유지되도록 sanitize 후 HTML 렌더.
  // contents-detail-body.tsx 와 동일한 prepare → sanitize 파이프라인 사용.
  const isReadonlyView = mode === "detail";

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
        内容<span className="text-[#FF1A1A]">*</span>
      </h2>
      {isReadonlyView ? (
        <div
          className="w-full min-h-[200px] p-4 border border-[#EAF0F6] rounded-[4px] bg-[#FDFEFE] font-['Noto_Sans_JP'] text-[14px] leading-[1.8] text-[#101010] prose prose-sm max-w-none overflow-x-auto [&_table]:table-fixed [&_table]:w-full"
          dangerouslySetInnerHTML={{
            __html: sanitizeContentHtml(prepareBodyForRender(content)),
          }}
        />
      ) : (
        <RichEditorLoader
          defaultValue={content}
          onChange={onContentChange}
          onParseError={onContentParseError}
          onUploadError={onContentUploadError}
          editable={!disabled}
          ariaLabel="内容を入力"
          placeholder="内容を入力してください"
        />
      )}
    </div>
  );
}
