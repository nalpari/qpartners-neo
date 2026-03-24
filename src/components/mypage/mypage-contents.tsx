"use client";

import { Activity, useState } from "react";
import { MypageTab } from "@/components/layout/mypage-tab";
import type { MypageTabKey } from "@/components/layout/mypage-tab";

export function MypageContents() {
  const [activeTab, setActiveTab] = useState<MypageTabKey>("info");

  return (
    <>
      <MypageTab activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex flex-col items-center w-full">
        <div className="w-full max-w-[1440px] py-[24px] px-[24px] lg:px-0">
          <Activity mode={activeTab === "info" ? "visible" : "hidden"}>
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">
              私の情報/会社情報コンテンツ
            </p>
          </Activity>
          <Activity mode={activeTab === "downloads" ? "visible" : "hidden"}>
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">
              ダウンロード履歴コンテンツ
            </p>
          </Activity>
        </div>
      </main>
    </>
  );
}
