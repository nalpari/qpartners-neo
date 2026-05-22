"use client";

import { useEffect, useRef } from "react";

import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import { useAuthFlag } from "@/hooks/use-auth-flag";
import { HomeVisual } from "./home-visual";
import { HomeSearchMobile } from "./home-search-mobile";
import { HomeNotices } from "./home-notices";
import { HomeContents } from "./home-contents";
import { HomeSidebar } from "./home-sidebar";
import { HomeDownloads } from "./home-downloads";

export function HomeMain() {
  // 자동로그인 inbound (외부 3사 → /api/auth/auto-login/inbound) sync.
  //   서버는 JWT 쿠키만 set 하고 `?auto_login=1` 쿼리로 / 로 redirect.
  //   클라이언트 localStorage 의 `qp-auth-active` flag 가 없으면 Gnb 의 useQuery(enabled)
  //   가 false 라 `/auth/login-user-info` 호출 자체가 안 일어나 로그인 UI 가 표시되지 않는다.
  //   본 useEffect 가 1회 감지 → flag set + dispatchAuthChange + URL 의 쿼리 제거.
  //   useRef 로 StrictMode 더블 마운트에서도 1회만 처리 (login-contents.tsx reset-token 패턴 미러).
  const autoLoginSynced = useRef(false);
  useEffect(() => {
    if (autoLoginSynced.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto_login") !== "1") return;
    autoLoginSynced.current = true;
    try {
      localStorage.setItem(AUTH_FLAG_KEY, "1");
    } catch (storageErr) {
      console.error("[HomeMain] AUTH_FLAG 쓰기 실패:", storageErr);
    }
    dispatchAuthChange();
    window.history.replaceState({}, "", "/");
  }, []);

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
