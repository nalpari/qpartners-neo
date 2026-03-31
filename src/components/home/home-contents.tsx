// Design Ref: §5 — コンテンツ 섹션
// PC (272-601): rounded-[12px] shadow 컨테이너 안에 헤더+카드
// MO (272-1144): 헤더는 bg-[#f7f9fb], 각 카드는 독립 bg-white 블록

import Link from "next/link";
import Image from "next/image";
import { HomeContentCard } from "./home-content-card";
import { DUMMY_CONTENTS } from "./home-dummy-data";

export function HomeContents() {
  return (
    <>
      {/* === PC Layout === */}
      <div className="hidden lg:flex h-full flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] px-[42px] pb-[42px] overflow-hidden">
        <ContentsHeader />
        <div className="flex flex-col gap-[18px]">
          {DUMMY_CONTENTS.map((item) => (
            <HomeContentCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* === MO Layout === */}
      <div className="flex lg:hidden flex-col gap-[10px]">
        {/* Header — bg 투명 (부모 f7f9fb 노출) */}
        <div className="px-[24px] pt-[16px] pb-[8px]">
          <ContentsHeader />
        </div>
        {/* Cards — 각각 독립 bg-white 블록 */}
        {DUMMY_CONTENTS.map((item) => (
          <div key={item.id} className="bg-white">
            <HomeContentCard item={item} />
          </div>
        ))}
      </div>
    </>
  );
}

function ContentsHeader() {
  return (
    <div className="flex items-center gap-[12px] pr-[4px]">
      <div className="flex items-center justify-center size-[40px] bg-[#d2dbe5] rounded-full shrink-0">
        <Image
          src="/asset/images/contents/home_cont_icon.svg"
          alt=""
          width={40}
          height={40}
        />
      </div>
      <h2 className="flex-1 font-['Noto_Sans_JP'] font-bold text-[16px] lg:text-[18px] text-[#2e5884] leading-[1.5]">
        最近コンテンツ
      </h2>
      <Link
        href="/contents"
        className="flex items-center shrink-0 font-['Noto_Sans_JP'] font-medium text-[13px] text-[#6a88a9] leading-[1.5] whitespace-nowrap underline"
      >
        全体を見る
        <Image
          src="/asset/images/contents/read_more_icon.svg"
          alt=""
          width={24}
          height={24}
        />
      </Link>
    </div>
  );
}
