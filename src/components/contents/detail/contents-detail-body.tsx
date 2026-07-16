"use client";

import { prepareBodyForRender } from "@/lib/rich-editor/prepare-body-for-render";
import { sanitizeContentHtml } from "@/lib/rich-editor/sanitize-html";

import { formatDate } from "@/lib/format";

// Design Ref: §4.5 — ISO 날짜 포맷 + HTML body 렌더링

interface ContentsDetailBodyProps {
  title: string;
  createdAt: string;
  updatedAt: string;
  /** 서버 단일 출처 — 최초 등록 이후 1회 이상 갱신 여부 */
  hasBeenUpdated: boolean;
  viewCount: number;
  body: string | null;
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-white border border-[#EEE] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
        {label}
      </span>
      <span className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#999]">
        {value}
      </span>
    </div>
  );
}

export function ContentsDetailBody({
  title,
  createdAt,
  updatedAt,
  hasBeenUpdated,
  viewCount,
  body,
}: ContentsDetailBodyProps) {
  const formattedCreated = formatDate(createdAt);
  const formattedUpdated = formatDate(updatedAt);

  return (
    <div className="bg-white rounded-none lg:rounded-[12px] shadow-none lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-[18px] px-6 py-[34px] lg:py-[48px] w-full lg:w-[1440px]">
      {/* 헤더: 제목 + 날짜 */}
      <div className="border-b border-[#EEE] pb-6">
        {/* PC: 가로 (제목 좌 / 날짜 우) */}
        <div className="hidden lg:flex items-center gap-[10px]">
          <h1 className="flex-1 font-['Noto_Sans_JP'] font-semibold text-[18px] leading-normal text-[#101010]">
            {title}
          </h1>
          <div className="flex items-center gap-3 shrink-0">
            <MetaBadge label="登録日" value={formattedCreated} />
            {hasBeenUpdated && <MetaBadge label="更新日" value={formattedUpdated} />}
            <MetaBadge label="VIEW" value={viewCount.toLocaleString()} />
          </div>
        </div>

        {/* MO: 세로 (날짜 상 / 제목 하) */}
        <div className="flex lg:hidden flex-col gap-[18px]">
          <div className="flex items-center gap-3">
            <MetaBadge label="登録日" value={formattedCreated} />
            {hasBeenUpdated && <MetaBadge label="更新日" value={formattedUpdated} />}
          </div>
          <h1 className="font-['Noto_Sans_JP'] font-semibold text-[18px] leading-normal text-[#101010]">
            {title}
          </h1>
        </div>
      </div>

      {/* 본문 — 렌더 전처리(prepareBodyForRender) → sanitize → 삽입.
          [&_table]:table-fixed + [&_table]:w-full: 에디터(.ProseMirror table)와 동일한
          width:100% + fixed 조합으로, colwidth/colgroup이 없는 표도 컬럼이 균등 분배되어
          빈 셀이 0폭으로 붕괴되는 현상을 막는다. */}
      {body && (
        <div
          className="font-['Noto_Sans_JP'] text-[14px] leading-[1.7] text-[#505050] prose prose-sm max-w-none overflow-x-auto [&_table]:table-fixed [&_table]:w-full"
          dangerouslySetInnerHTML={{
            __html: sanitizeContentHtml(prepareBodyForRender(body)),
          }}
        />
      )}
    </div>
  );
}
