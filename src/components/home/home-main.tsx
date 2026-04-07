"use client";

import { useQuery } from "@tanstack/react-query";
import type { LoginUser } from "@/lib/schemas/auth";
import { HomeVisual } from "./home-visual";
import { HomeSearchMobile } from "./home-search-mobile";
import { HomeContents } from "./home-contents";
import { HomeSidebar } from "./home-sidebar";
import { HomeDownloads } from "./home-downloads";

export function HomeMain() {
  // 헤더가 관리하는 auth 캐시를 구독 (직접 fetch 안 함, 캐시 변경 시 리렌더링)
  const { data: user = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });
  const isLoggedIn = user != null;

  return (
    <div className="flex flex-col items-center w-full bg-[#f7f9fb]">
      <HomeVisual />
      <HomeSearchMobile />

      <div className="flex flex-col lg:flex-row gap-[10px] lg:gap-[18px] w-full max-w-[1440px] lg:px-0 pb-[10px] lg:pb-[48px] lg:mt-[-40px] relative z-5">
        <div className="flex-1 min-w-0">
          <HomeContents />
        </div>

        {isLoggedIn && <HomeSidebar />}
        {isLoggedIn && <HomeDownloads />}
      </div>
    </div>
  );
}
