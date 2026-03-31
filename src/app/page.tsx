// Design Ref: §7 — メインホームページ (로그인 전/후 + PC/MO 레이아웃 분기)

import { HomeVisual } from "@/components/home/home-visual";
import { HomeSearchMobile } from "@/components/home/home-search-mobile";
import { HomeContents } from "@/components/home/home-contents";
import { HomeSidebar } from "@/components/home/home-sidebar";
import { HomeDownloads } from "@/components/home/home-downloads";

// Plan SC: SC-04 — 로그인 상태에 따른 레이아웃 분기 (임시 상수, 향후 auth-store 연동)
const IS_LOGGED_IN = false; // TODO: auth-store 연동 후 실제 값으로 교체

export default function Home() {
  return (
    <div className="flex flex-col items-center w-full bg-[#f7f9fb]">
      {/* Visual (PC: 검색바 포함 / MO: 검색바 제외) */}
      <HomeVisual />

      {/* MO: 검색바 (비주얼 바로 아래, 흰색 배경) */}
      <HomeSearchMobile />

      {/* Body */}
      <div className="flex flex-col lg:flex-row gap-[10px] lg:gap-[18px] w-full max-w-[1440px] lg:px-[24px] lg:px-0 pb-[10px] lg:pb-[48px] lg:mt-[-40px] relative z-5">
        {/* Contents (항상 표시) */}
        <div className="flex-1 min-w-0">
          <HomeContents />
        </div>

        {/* PC: 사이드바 (로그인 후 — 최근 다운로드만) */}
        {IS_LOGGED_IN && <HomeSidebar />}

        {/* MO: 최근 다운로드 (로그인 후, 콘텐츠 아래) */}
        {IS_LOGGED_IN && <HomeDownloads />}
      </div>
    </div>
  );
}
