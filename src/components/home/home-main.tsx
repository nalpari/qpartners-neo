"use client";

import { useAuthFlag } from "@/hooks/use-auth-flag";
import { HomeVisual } from "./home-visual";
import { HomeSearchMobile } from "./home-search-mobile";
import { HomeNotices } from "./home-notices";
import { HomeContents } from "./home-contents";
import { HomeSidebar } from "./home-sidebar";
import { HomeDownloads } from "./home-downloads";

export function HomeMain() {
  // 로그인 여부는 AUTH_FLAG_KEY 기반 synchronous 플래그로 결정 — Gnb 의 `/auth/login-user-info`
  // fetch 가 완료되기 전에도 첫 렌더부터 layout(HomeSidebar/HomeDownloads) 가 확정되어
  // 마운트/언마운트로 인한 "인증 모션" flicker 가 제거됨.
  const isLoggedIn = useAuthFlag();

  return (
    <div className="flex flex-col items-center w-full bg-[#f7f9fb]">
      <HomeVisual />
      <HomeSearchMobile />

      <div className="flex flex-col gap-[10px] lg:gap-[18px] w-full max-w-[1440px] lg:px-0 pb-[10px] lg:pb-[48px] lg:mt-[-40px] relative z-5">
        <HomeNotices />

        <div className="flex flex-col lg:flex-row gap-[10px] lg:gap-[18px] w-full">
          <div className="flex-1 min-w-0">
            <HomeContents />
          </div>

          {isLoggedIn && <HomeSidebar />}
          {isLoggedIn && <HomeDownloads />}
        </div>
      </div>
    </div>
  );
}
