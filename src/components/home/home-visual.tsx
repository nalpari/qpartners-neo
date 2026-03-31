// Design Ref: §2 — 비주얼 섹션 + 검색바 통합 (Figma 272-579)

import Image from "next/image";
import { HomeSearch } from "./home-search";

export function HomeVisual() {
  return (
    <section className="relative w-full hidden lg:block">
      {/* Background Image */}
      <Image
        src="/asset/images/contents/main_visual.png"
        alt=""
        fill
        className="object-cover pointer-events-none"
        priority
      />
      {/* Gradient Overlay + Content + Search */}
      <div
        className="relative flex flex-col items-center pt-[48px] lg:pt-[70px] pb-[32px] lg:pb-[135px]"
        style={{ backgroundImage: "linear-gradient(13deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 50%, rgb(0,0,0) 100%)" }}
      >
        <div className="flex flex-col gap-[48px] items-center w-full max-w-[900px] px-[24px]">
          {/* Copy */}
          <div className="flex flex-col items-center w-full">
            <h1
              className="font-['Pretendard'] font-black text-[40px] lg:text-[72px] leading-[1.4] text-center tracking-[-1.8px] bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.5) 16.78%, white 47%, rgba(255,255,255,0.5) 86.22%)" }}
            >
              Q.PARTNERS
            </h1>
            <div className="text-center pl-[8px]">
              <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[16px] leading-[1.5] text-[rgba(255,255,255,0.6)]">
                HWJからのお知らせや、各種資料のダウンロードが可能です.
              </p>
              <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[16px] leading-[1.5] text-[rgba(255,255,255,0.6)]">
                最新の技術情報 製品マニュアル、保証制度についてご確認いただけます.
              </p>
            </div>
          </div>

          {/* Search — PC only (모바일은 page.tsx에서 별도 배치) */}
          <div className="hidden lg:block w-full">
            <HomeSearch />
          </div>
        </div>
      </div>
    </section>
  );
}
