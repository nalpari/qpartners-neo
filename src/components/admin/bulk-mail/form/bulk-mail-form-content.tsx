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
        // 타이틀 InputBox 의 readonly 스타일(#F5F5F5 / #EBEBEB / cursor-not-allowed) 과 통일.
        // 의도: detail 모드는 "발송 완료된 메일의 비활성 미리보기" — 본문/서명을 한 톤으로 흐리게.
        // 인라인 color 가 박힌 span(에디터에서 입힌 색상) 까지 모두 회색으로 보이도록
        // `[&_*]:!text-[#999]` 로 전체 후손 텍스트 색상을 강제 override.
        // (서명만 회색이 아닌 본문 전체를 동일 톤으로 가라앉히는 게 디자인 정책 — 사용자 명시 요청 "글도 회색 쳐".
        //  코드리뷰의 opacity 대안은 색상 정보 유지 트레이드오프가 있으나, 디자인 정책상 회색 일색이 우선.)
        <div
          aria-readonly="true"
          className="w-full min-h-[200px] p-4 border border-[#EBEBEB] rounded-[4px] bg-[#F5F5F5] cursor-not-allowed font-['Noto_Sans_JP'] text-[14px] leading-[1.8] text-[#999] [&_*]:!text-[#999] prose prose-sm max-w-none overflow-x-auto [&_table]:table-fixed [&_table]:w-full"
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
