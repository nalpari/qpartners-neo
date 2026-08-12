"use client";

import type { TabType } from "@/components/login/types";

const TABS: { key: TabType; label: string }[] = [
  { key: "dealer", label: "販売店会員" },
  { key: "installer", label: "施工店会員" },
  { key: "general", label: "既存Q.PARTNERS会員" },
];

interface LoginTabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export function LoginTabs({ activeTab, onChange }: LoginTabsProps) {
  return (
    <div className="flex w-full">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            // PC(lg~): 기존 디자인대로 탭 폭(=하단 보더 길이)을 균등 3분할.
            //   min-w-0 이 없으면 flex item 의 자동 최소 폭이 콘텐츠 폭이라 라벨이 긴
            //   既存Q.PARTNERS会員 탭이 넓어져 균등분할이 깨진다.
            // MO: 균등분할 시 긴 라벨을 한 줄에 담으려면 11px 이하로 내려가야 해 가독성이
            //   떨어지므로 grow+basis-auto 로 라벨 폭에 비례 분배한다.
            className={`grow basis-auto lg:flex-1 lg:min-w-0 pb-3 border-b-2 font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-center whitespace-nowrap transition-all duration-200 ${
              isActive
                ? "border-[#E97923] text-[#E97923] font-medium"
                : "border-[#999] text-[#999] font-normal"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
