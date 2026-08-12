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
            // PC(카드 최대폭 1440px 기준): 기존 디자인대로 탭 폭(=하단 보더 길이)을 균등 3분할.
            //   min-w-0 이 없으면 flex item 의 자동 최소 폭이 콘텐츠 폭이라 라벨이 긴
            //   既存Q.PARTNERS会員 탭이 넓어져 균등분할이 깨진다.
            //   폰트는 13px 이 상한이다 — 슬롯 140px 대비 라벨 실측(활성 font-medium 기준)
            //   13px 131.2px(여유 9px) / 14px 141.2px(1.2px 넘침) / 15px 151.3px(11px 넘침).
            //   PC·MO 동일 13px 이라 lg: 분기가 없다.
            //   ※ 좌측 이미지 패널이 w-[860px] shrink-0 이라 카드가 1440px 미만이면
            //     슬롯이 급격히 좁아진다(카드 1265px → 슬롯 93px). whitespace-nowrap 이라
            //     줄바꿈 대신 넘치므로, 이 구간 대응은 별도 과제다.
            // MO: 균등분할 시 긴 라벨을 한 줄에 담으려면 11px 이하로 내려가야 해 가독성이
            //   떨어지므로 grow+basis-auto 로 각 탭이 라벨 폭을 확보한 뒤 남는 공간을
            //   균등하게 나눠 갖도록 한다.
            className={`grow basis-auto lg:flex-1 lg:min-w-0 pb-3 border-b-2 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-center whitespace-nowrap transition-all duration-200 ${
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
