"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { LoginUser } from "@/lib/schemas/auth";
import { HomeVisual } from "./home-visual";
import { HomeSearchMobile } from "./home-search-mobile";
import { HomeContents } from "./home-contents";
import { HomeSidebar } from "./home-sidebar";
import { HomeDownloads } from "./home-downloads";

export function HomeMain() {
  const queryClient = useQueryClient();
  const user = queryClient.getQueryData<LoginUser>(["auth", "login-user-info"]);
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
