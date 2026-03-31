"use client";

import type { TabType } from "@/components/login/types";

const TABS: { key: TabType; label: string }[] = [
  { key: "dealer", label: "販売店会員" },
  { key: "installer", label: "施工店会員" },
  { key: "general", label: "一般会員" },
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
            className={`flex-1 pb-3 border-b-2 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] leading-[1.5] text-center transition-all duration-200 ${
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
