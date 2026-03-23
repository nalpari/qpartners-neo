"use client";

import type { ContentDetailItem } from "../contents-dummy-data";

interface ContentsDetailTargetProps {
  postTargets: ContentDetailItem["postTargets"];
}

export function ContentsDetailTarget({
  postTargets,
}: ContentsDetailTargetProps) {
  return (
    <>
      {/* PC: 가로 셀 나열 */}
      <div className="hidden lg:block bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] p-6 w-[1440px]">
        <div className="flex gap-1">
          {/* Th: 投稿対象 */}
          <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 self-stretch">
            <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
              投稿対象
            </span>
          </div>
          {/* 5개 대상 셀: 처음 2개 flex-1, 나머지 3개 w-[254px] */}
          {postTargets.map((target, idx) => (
            <div
              key={target.label}
              className={`flex flex-col gap-2 bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 self-stretch justify-center ${
                idx < 2 ? "flex-1" : "w-[254px] shrink-0"
              } ${idx === 0 ? "py-3" : "py-2"}`}
            >
              <span
                className={`inline-flex items-center justify-center self-start px-2 py-[2px] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] truncate ${
                  target.active
                    ? "bg-[#EFF7FF] text-[#1060B4] font-medium"
                    : "bg-[#F3F3F3] text-[#101010] font-normal"
                }`}
              >
                {target.label}
              </span>
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {target.period}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* MO: 세로 나열 */}
      <div className="block lg:hidden bg-white px-6 py-[34px] w-full">
        <div className="flex flex-col gap-6">
          {postTargets.map((target, idx) => (
            <div key={target.label} className="flex flex-col gap-2">
              {idx === 0 && (
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] mb-1">
                  投稿対象
                </p>
              )}
              <span
                className={`inline-flex items-center justify-center self-start px-2 py-[2px] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] ${
                  target.active
                    ? "bg-[#EFF7FF] text-[#1060B4] font-medium"
                    : "bg-[#F3F3F3] text-[#101010] font-normal"
                }`}
              >
                {target.label}
              </span>
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                {target.period}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
