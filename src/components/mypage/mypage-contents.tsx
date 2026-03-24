"use client";

import { Activity, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MypageTab } from "@/components/layout/mypage-tab";
import type { MypageTabKey } from "@/components/layout/mypage-tab";
import { MypageInfo } from "@/components/mypage/info/mypage-info";
import { DownloadHistory } from "@/components/mypage/downloads/download-history";

const VALID_TABS: MypageTabKey[] = ["info", "downloads"];

function getInitialTab(searchParams: URLSearchParams): MypageTabKey {
  const tab = searchParams.get("tab");
  if (tab && VALID_TABS.includes(tab as MypageTabKey)) {
    return tab as MypageTabKey;
  }
  return "info";
}

export function MypageContents() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MypageTabKey>(() =>
    getInitialTab(searchParams)
  );

  const handleTabChange = useCallback(
    (tab: MypageTabKey) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "info") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(`/mypage${query ? `?${query}` : ""}`, {
        transitionTypes: ["fade"],
      });
    },
    [searchParams, router]
  );

  return (
    <>
      <MypageTab activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="flex flex-col items-center w-full bg-[#f7f9fb] overflow-hidden">
        <Activity mode={activeTab === "info" ? "visible" : "hidden"}>
          <div className="w-full flex flex-col items-center gap-[42px] lg:py-[24px] lg:pb-[48px] pb-[0px]">
            <MypageInfo />
          </div>
        </Activity>
        <Activity mode={activeTab === "downloads" ? "visible" : "hidden"}>
          <div className="w-full flex flex-col items-center gap-[42px] lg:py-[24px] lg:pb-[48px] pb-[0px]">
            <DownloadHistory />
          </div>
        </Activity>
      </main>
    </>
  );
}
