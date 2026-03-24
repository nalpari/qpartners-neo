"use client";

import { Activity, useState } from "react";
import { MypageTab } from "@/components/layout/mypage-tab";
import type { MypageTabKey } from "@/components/layout/mypage-tab";
import { MypageInfo } from "@/components/mypage/info/mypage-info";

export function MypageContents() {
  const [activeTab, setActiveTab] = useState<MypageTabKey>("info");

  return (
    <>
      <MypageTab activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex flex-col items-center w-full bg-[#f7f9fb] overflow-hidden">
        <Activity mode={activeTab === "info" ? "visible" : "hidden"}>
          <div className="w-full flex flex-col items-center gap-[42px] lg:py-[24px] lg:pb-[48px] pb-[0px]">
            <MypageInfo />
          </div>
        </Activity>
        <Activity mode={activeTab === "downloads" ? "visible" : "hidden"}>
          <div className="w-full max-w-[1440px] py-[24px] px-[24px] lg:px-0">
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">
              ダウンロード履歴コンテンツ
            </p>
          </div>
        </Activity>
      </main>
    </>
  );
}
