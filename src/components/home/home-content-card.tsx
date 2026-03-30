// Design Ref: §4 — 콘텐츠 카드 (Figma 272-601 기준, 카테고리 가로 배치)

import Link from "next/link";
import Image from "next/image";
import type { ContentItem } from "./home-dummy-data";

interface HomeContentCardProps {
  item: ContentItem;
}

const CATEGORY_LABELS: { key: keyof ContentItem["categories"]; label: string }[] = [
  { key: "infoType", label: "情報タイプ" },
  { key: "businessType", label: "業務分類" },
  { key: "productType", label: "製品分類" },
  { key: "productStatus", label: "製品状態" },
  { key: "contentType", label: "内容分類" },
];

export function HomeContentCard({ item }: HomeContentCardProps) {
  return (
    <div className="flex flex-col gap-[16px] lg:gap-[20px] bg-white lg:border lg:border-[#e6eef6] lg:rounded-[12px] pt-[24px] lg:pt-[28px] px-[24px] lg:px-[28px] pb-[34px] lg:pb-[18px] overflow-hidden">
      {/* Content */}
      <div className="flex flex-col gap-[18px]">
        {/* Top info */}
        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[8px]">
            {/* Badges + Bookmark */}
            <div className="flex items-center">
              <div className="flex-1 flex items-center gap-[4px]">
                {item.isNew && (
                  <span className="px-[8px] py-[2px] rounded-[4px] bg-[#f4f9fd] border border-[#e3effb] font-['Pretendard'] font-medium text-[13px] text-[#63a5f2] leading-[1.5]">
                    NEW
                  </span>
                )}
                {item.isUpdated && (
                  <span className="px-[8px] py-[2px] rounded-[4px] bg-[#fff3f8] border border-[#f8e3eb] font-['Pretendard'] font-medium text-[13px] text-[#bc6e8d] leading-[1.5]">
                    UPDATE
                  </span>
                )}
              </div>
              {/* Download icon */}
              <div className="flex items-center justify-center size-[38px] rounded-full bg-[#f2f6fa] shrink-0">
                <Image
                  src="/asset/images/contents/home_down_icon.svg"
                  alt=""
                  width={38}
                  height={38}
                />
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center gap-[8px]">
              <span className="font-['Pretendard'] font-medium text-[13px] text-[#6a88a9] leading-[1.4]">
                {item.date}
              </span>
              <div className="flex items-center gap-[4px]">
                <Image
                  src="/asset/images/contents/reload_icon.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="shrink-0"
                />
                <span className="font-['Pretendard'] text-[13px] text-[#6a88a9] leading-[1.4]">
                  更新 : {item.updatedDate}
                </span>
              </div>
            </div>
          </div>

          {/* Title */}
          <h3 className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.5] text-[#2e5884]">
            {item.title}
          </h3>
        </div>

        {/* Category tags — PC: 가로(flex-wrap), MO: 세로(full-width, 라벨 w-[79px]) */}
        <div className="flex flex-col gap-[6px] lg:flex-row lg:flex-wrap w-full">
          {CATEGORY_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-start w-full lg:w-auto lg:shrink-0">
              <div className="flex items-center justify-center w-[79px] lg:w-auto px-[12px] py-[8px] bg-[#f4f2f0] border-l border-t border-b border-[#f4f2f0] rounded-l-[4px] shrink-0">
                <span className="font-['Noto_Sans_JP'] font-medium text-[11px] text-[#9c8b78] uppercase whitespace-nowrap leading-[1.3]">
                  {label}
                </span>
              </div>
              <div className="flex flex-1 lg:flex-none items-center px-[12px] py-[8px] bg-white border border-[#f4f2f0] rounded-r-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[11px] text-[#505050] uppercase whitespace-nowrap leading-[1.3]">
                  {item.categories[key]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Read More */}
      <div className="flex items-center">
        <Link href={`/contents/${item.id}`} className="flex items-center">
          <span className="font-['Pretendard'] font-medium text-[11px] text-[#004ea1] uppercase tracking-[1.375px] leading-[1.4]">
            Read More
          </span>
          <Image
            src="/asset/images/contents/read_more_icon.svg"
            alt=""
            width={32}
            height={32}
          />
        </Link>
      </div>
    </div>
  );
}
