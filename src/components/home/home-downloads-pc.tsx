// Design Ref: §6.2 — PC 最近ダウンロード (Figma 272-757, 사이드바 전용)

import Image from "next/image";
import { DUMMY_DOWNLOADS } from "./home-dummy-data";

export function HomeDownloadsPc() {
  return (
    <div className="flex flex-col flex-1 gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] px-[32px] pb-[32px] overflow-hidden">
      <div className="flex items-center gap-[12px]">
        <div className="flex items-center justify-center size-[40px] bg-[#f9e6c8] rounded-full shrink-0 overflow-hidden">
          <Image
            src="/asset/images/contents/down_history_icon.svg"
            alt=""
            width={40}
            height={40}
          />
        </div>
        <h3 className="font-['Noto_Sans_JP'] font-bold text-[18px] text-[#9e8e6c] leading-[1.5] whitespace-nowrap">
          最近ダウンロード
        </h3>
      </div>
      <div className="flex flex-col">
        {DUMMY_DOWNLOADS.map((dl, i) => (
          <div
            key={dl.id}
            className={`flex flex-col gap-[2px] py-[24px] ${i === 0 ? "pt-[12px]" : ""} ${i < DUMMY_DOWNLOADS.length - 1 ? "border-b border-[#f2f2f2]" : ""}`}
          >
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
    </div>
  );
}
