// Design Ref: §6.2 — MO 最近ダウンロード (Figma 272-1278)
// 헤더: bg 투명(부모 f7f9fb), 각 아이템: 독립 bg-white 블록, gap-[10px]

import Image from "next/image";
import { DUMMY_DOWNLOADS } from "./home-dummy-data";

export function HomeDownloads() {
  return (
    <div className="flex lg:hidden flex-col gap-[10px]">
      {/* Header */}
      <div className="flex items-center gap-[12px] px-[24px] pt-[16px] pb-[8px]">
        <div className="flex items-center justify-center size-[40px] bg-[#f9e6c8] rounded-full shrink-0 overflow-hidden">
          <Image
            src="/asset/images/contents/down_history_icon.svg"
            alt=""
            width={40}
            height={40}
          />
        </div>
        <h3 className="font-['Noto_Sans_JP'] font-bold text-[16px] text-[#9e8e6c] leading-[1.5] whitespace-nowrap">
          最近ダウンロード
        </h3>
      </div>
      {/* Items */}
      {DUMMY_DOWNLOADS.map((dl) => (
        <div key={dl.id} className="flex flex-col gap-[2px] bg-white pt-[24px] pb-[34px] px-[24px]">
          <span className="font-['Noto_Sans_JP'] text-[13px] text-[#999] leading-[1.5]">
            {dl.materialTitle}
          </span>
          <div className="flex flex-col gap-[8px]">
            <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010] leading-[1.5]">
              {dl.fileName}
            </span>
            <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999] leading-[1.5]">
              {dl.date}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
