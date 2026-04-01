"use client";

interface ContentsDetailBodyProps {
  title: string;
  createdAt: string;
  updatedAt: string;
  body: string;
}

function DateBadge({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-white border border-[#EEE] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
        {label}
      </span>
      <span className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#999]">
        {date}
      </span>
    </div>
  );
}

export function ContentsDetailBody({
  title,
  createdAt,
  updatedAt,
  body,
}: ContentsDetailBodyProps) {
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
            <DateBadge label="登録日" date={createdAt} />
            <DateBadge label="更新日" date={updatedAt} />
          </div>
        </div>

        {/* MO: 세로 (날짜 상 / 제목 하) */}
        <div className="flex lg:hidden flex-col gap-[18px]">
          <div className="flex items-center gap-3">
            <DateBadge label="登録日" date={createdAt} />
            <DateBadge label="更新日" date={updatedAt} />
          </div>
          <h1 className="font-['Noto_Sans_JP'] font-semibold text-[18px] leading-normal text-[#101010]">
            {title}
          </h1>
        </div>
      </div>

      {/* 본문 */}
      <div className="font-['Noto_Sans_JP'] text-[14px] leading-[1.7] text-[#505050] whitespace-pre-wrap">
        {body}
      </div>
    </div>
  );
}
