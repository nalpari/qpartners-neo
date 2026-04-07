// Design Ref: §2 — 비주얼 섹션 + 검색바 통합 (Figma 272-579)

import Image from "next/image";
import { HomeSearch } from "./home-search";

export function HomeVisual() {
  return (
    <section className="relative w-full">
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
        className="relative flex flex-col items-center pt-[87px] lg:pt-[70px] pb-[87px] lg:pb-[135px]"
        style={{ backgroundImage: "linear-gradient(37deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 50%, rgb(0,0,0) 100%)" }}
      >
        <div className="flex flex-col gap-[48px] items-center w-full max-w-[900px] px-[24px]">
          {/* Copy */}
          <div className="flex flex-col items-center w-full">
            <h1
              className="font-['Pretendard'] font-black text-[50px] lg:text-[72px] leading-[1.4] text-center tracking-[-1.27px] lg:tracking-[-1.8px] bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.5) 16.78%, white 47%, rgba(255,255,255,0.5) 86.22%)" }}
            >
              Q.PARTNERS
            </h1>
            <div className="text-center pl-[8px]">
              <p className="font-['Noto_Sans_JP'] text-[12px] lg:text-[16px] leading-[1.5] text-[rgba(255,255,255,0.6)]">
              ハンファジャパンの販売・施工パートナー向け
              </p>
              <p className="font-['Noto_Sans_JP'] text-[12px] lg:text-[16px] leading-[1.5] text-[rgba(255,255,255,0.6)]">
              エネルギーソリューション情報プラットフォーム
              </p>
            </div>
          </div>

          {/* Search — PC only (모바일은 HomeSearchMobile로 별도 배치) */}
          <div className="hidden lg:block w-full">
            <HomeSearch />
          </div>
        </div>
      </div>
    </section>
  );
}
