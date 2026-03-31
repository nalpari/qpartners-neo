"use client";

import Image from "next/image";
import { usePopupStore } from "@/lib/store";

export function Footer() {
  const openPopup = usePopupStore((s) => s.openPopup);
  return (
    <footer className="flex items-center justify-center w-full border-t border-[#f5f5f5] bg-white">
      {/* PC */}
      <div className="hidden lg:flex items-center gap-[94px] w-[1440px] py-[20px]">
        {/* 로고 + 사무국 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Image
            src="/asset/images/layout/footer_logo.svg"
            alt="Hanwha Japan"
            width={160}
            height={30}
            unoptimized
            style={{ height: "auto" }}
          />
          <span className="w-px h-3 bg-[rgba(16,16,16,0.2)]" />
          <span className="font-['Pretendard'] font-semibold text-[14px] leading-[1.5] text-[#101010] uppercase whitespace-nowrap">
            Q.PARTNERS
          </span>
          <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#101010]">
            事務局
          </span>
        </div>

        {/* 정보 영역 */}
        <div className="flex flex-col gap-3 items-center w-[684px]">
          {/* 연락처 + 이용약관 */}
          <div className="flex items-center gap-[7px] w-full">
            <span className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-[1.5] text-[#767676] whitespace-nowrap">
              Tel : 0120-801-170
            </span>
            <span className="w-px h-[10px] bg-[rgba(16,16,16,0.2)]" />
            <span className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-[1.5] text-[#767676] whitespace-nowrap">
              Email : q-partners@hqj.co.jp
            </span>
            <span className="w-px h-[10px] bg-[rgba(16,16,16,0.2)]" />
            <span className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-[1.5] text-[#767676] whitespace-nowrap">
              お問い合わせ受付時間 : 平日10:00-12:00 13:00-17:00
            </span>
            <span className="w-px h-[10px] bg-[rgba(16,16,16,0.2)]" />
            <button
              type="button"
              onClick={() => openPopup("terms")}
              className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#e97923] underline whitespace-nowrap cursor-pointer"
            >
              利用規約
            </button>
          </div>

          {/* 저작권 */}
          <p className="font-pretendard font-normal text-[13px] leading-[1.5] text-[#999] text-center w-full">
            COPYRIGHT©2026 Hanwha Japan All Rights Reserved.
          </p>
        </div>
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col items-start w-full pt-[18px] pb-[28px] px-[24px]">
        {/* 로고 + 사무국 */}
        <div className="flex items-center gap-1.5 w-full">
          <div className="flex items-center gap-1 h-[42px]">
            <Image
              src="/asset/images/layout/footer_logo.svg"
              alt="Hanwha Japan"
              width={136}
              height={25}
              unoptimized
              style={{ height: "auto" }}
            />
            <span className="font-pretendard font-medium text-[12px] leading-[1.5] text-[#101010] uppercase whitespace-nowrap">
              Q.PARTNERS
            </span>
          </div>
          <span className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#101010] pb-1">
            事務局
          </span>
        </div>

        {/* 저작권 */}
        <p className="font-pretendard font-normal text-[12px] leading-[1.5] text-[#999] pl-1">
          COPYRIGHT©2026 Hanwha Japan All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
