"use client";

import Image from "next/image";
import { formatDate } from "@/lib/format";
import { Spinner } from "@/components/common";
import { useHomeDownloads } from "@/hooks/use-home-downloads";

export function HomeDownloads() {
  const { downloads, isLoading } = useHomeDownloads();

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
      {isLoading ? (
        <div className="flex items-center justify-center py-10 bg-white">
          <Spinner size={32} />
        </div>
      ) : downloads.length === 0 ? (
        <div className="bg-white py-10">
          <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
            ダウンロードしたデータがありません。
          </p>
        </div>
      ) : (
        downloads.map((dl) => (
          <div key={dl.id} className="flex flex-col gap-[2px] bg-white pt-[24px] pb-[34px] px-[24px]">
            <span className={`font-['Noto_Sans_JP'] text-[13px] leading-[1.5] ${dl.isExpired ? "line-through text-[#999]" : "text-[#999]"}`}>
              {dl.contentTitle}
            </span>
            <div className="flex flex-col gap-[8px]">
              <span className={`font-['Noto_Sans_JP'] text-[14px] leading-[1.5] ${dl.isExpired ? "line-through text-[#999]" : "text-[#101010]"}`}>
                {dl.fileName}
              </span>
              <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999] leading-[1.5]">
                {dl.downloadedAt ? formatDate(dl.downloadedAt) : ""}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
