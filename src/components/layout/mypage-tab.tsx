"use client";



import Link from "next/link";
import Image from "next/image";

export type MypageTabKey = "info" | "downloads";

interface TabItem {
  key: MypageTabKey;
  label: string;
}

const TABS: TabItem[] = [
  { key: "info", label: "私の情報/会社情報" },
  { key: "downloads", label: "ダウンロード履歴" },
];

interface MypageTabProps {
  activeTab: MypageTabKey;
  onTabChange: (tab: MypageTabKey) => void;
}

export function MypageTab({ activeTab, onTabChange }: MypageTabProps) {

  return (
    <>
      {/* PC */}
      <div className="hidden lg:flex flex-col items-center w-full bg-white border-b border-[#dee5ed] shadow-[0px_1px_1px_0px_rgba(32,55,77,0.05)]">
        <div className="relative flex items-center justify-between w-full max-w-[1440px] py-[16px]">
          {/* 타이틀 */}
          <div className="flex items-center gap-1 shrink-0">
            <h1 className="font-['Noto_Sans_JP'] font-semibold text-[20px] leading-[1.5] text-[#101010] w-[100px]">
              マイページ
            </h1>
          </div>

          {/* 탭 메뉴 */}
          <nav className="absolute inset-0 flex items-center justify-center gap-[78px]">
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={`relative flex items-center h-full font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-center whitespace-nowrap transition-colors duration-200 ${
                    isActive
                      ? "text-[#e97923]"
                      : "text-[#101010] hover:text-[#e97923]"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`absolute bottom-0 left-0 w-full h-[2px] bg-[#e97923] transition-opacity duration-300 ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* 브레드크럼 */}
          <nav className="flex items-center gap-[10px] shrink-0">
            <Link href="/">
              <Image
                src="/asset/images/layout/home_location.svg"
                alt="Home"
                width={16}
                height={16}
              />
            </Link>
            <svg
              width="5"
              height="8"
              viewBox="0 0 5 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 7L4 4L1 1"
                stroke="#101010"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-normal text-[#101010] whitespace-nowrap">
              マイページ
            </span>
          </nav>
        </div>
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col w-full">
        {/* Location 바 */}
        <div className="flex items-center justify-between w-full bg-white border-t border-black px-[24px] py-[16px]">
          <div className="flex flex-1 items-center pr-1">
            <h1 className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.5] text-[#101010]">
              マイページ
            </h1>
          </div>
          <nav className="flex items-center gap-[10px] shrink-0">
            <Link href="/">
              <Image
                src="/asset/images/layout/home_location.svg"
                alt="Home"
                width={16}
                height={16}
              />
            </Link>
            <svg
              width="5"
              height="8"
              viewBox="0 0 5 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 7L4 4L1 1"
                stroke="#101010"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-normal text-[#101010] whitespace-nowrap">
              マイページ
            </span>
          </nav>
        </div>

        {/* 탭 메뉴 리스트 */}
        <div className="flex flex-col gap-px">
          {TABS.map((tab, index) => {
            const isActive = tab.key === activeTab;
            const isLast = index === TABS.length - 1;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`flex items-start w-full bg-white border-t border-[#dee5ed] px-[24px] py-[18px] ${
                  isLast
                    ? "shadow-[0px_1px_1px_0px_rgba(32,55,77,0.05)]"
                    : ""
                }`}
              >
                <span
                  className={`font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] whitespace-nowrap ${
                    isActive ? "text-[#e97923]" : "text-[#101010]"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
