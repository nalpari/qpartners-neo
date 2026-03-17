"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Radio } from "@/components/common/radio";

const RELATED_SITES = [
  { label: "HANASYS DESIGN", value: "hanasys" },
  { label: "Q.ORDER", value: "qorder" },
  { label: "Q.MUSUBI", value: "qmusubi" },
  { label: "Q.PARTNERS", value: "qpartners" },
  { label: "Q.WARRANTY", value: "qwarranty" },
] as const;

const CURRENT_SITE = "qmusubi";

export function Gnb() {
  const isLoggedIn = false;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>(CURRENT_SITE);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="relative h-[68px] lg:h-[78px]">
      <header className="fixed top-0 left-0 flex items-center justify-center w-full bg-black z-50 h-[68px] lg:h-[78px] py-4.5">
        <div className="flex items-center justify-between w-full max-w-[1440px] px-5 lg:px-0">
          {/* PC 로고 — 가로 1줄 */}
          <Link href="/" className="hidden lg:flex items-center gap-2 shrink-0">
            <Image
              src="/asset/images/layout/logo_hanwha.svg"
              alt="Hanwha Japan"
              width={160}
              height={30}
            />
            <span className="w-px h-3 bg-[rgba(255,255,255,0.2)]" />
            <span className="font-pretendard font-medium text-[14px] leading-[1.5] text-white uppercase whitespace-nowrap">
              Q.PARTNERS
            </span>
          </Link>

          {/* 모바일 로고 — 세로 2줄 */}
          <Link href="/" className="flex lg:hidden flex-col shrink-0">
            <Image
              src="/asset/images/layout/logo_hanwha.svg"
              alt="Hanwha Japan"
              width={133}
              height={24}
            />
            <span className="font-pretendard font-medium text-[12px] leading-[1.5] text-white uppercase whitespace-nowrap pl-[30px]">
              Q.PARTNERS
            </span>
          </Link>

          {/* PC 메뉴 영역 */}
          <nav className="hidden lg:flex flex-1 items-center self-stretch">
            <ul className="flex flex-1 items-center justify-center gap-[54px] pl-[60px]">
              <li>
                <Link
                  href="#"
                  className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap"
                >
                  統合検索
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap"
                >
                  お知らせ
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap"
                >
                  資料ダウンロード
                </Link>
              </li>
              {isLoggedIn && (
                <li className="relative">
                  <button
                    type="button"
                    className="flex items-center gap-1 font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap"
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                  >
                    関連サイト
                    <Image
                      src="/asset/images/layout/icon_chevron_down.svg"
                      alt=""
                      width={20}
                      height={20}
                    />
                  </button>

                  {/* 関連サイト 드롭다운 패널 */}
                  <div
                    className={`absolute top-full left-0 mt-2 w-[240px] bg-white border border-[#e0e0e0] rounded-[4px] p-4 transition-all duration-200 ${
                      isDropdownOpen
                        ? "opacity-100 visible translate-y-0"
                        : "opacity-0 invisible -translate-y-1"
                    }`}
                  >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-black">
                          関連サイト
                        </span>
                        <button
                          type="button"
                          aria-label="閉じる"
                          className="flex items-center justify-center size-6"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M18 6L6 18M6 6l12 12"
                              stroke="#000"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <ul className="flex flex-col gap-2">
                        {RELATED_SITES.map((site) => (
                          <li key={site.value}>
                            <Radio
                              name="related-site"
                              value={site.value}
                              checked={selectedSite === site.value}
                              onChange={() => setSelectedSite(site.value)}
                              label={site.label}
                            />
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="flex items-center justify-center w-full mt-3 py-2 px-6 border border-[#333] rounded-[4px] font-['Noto_Sans_JP'] font-medium text-[14px] text-black"
                      >
                        移動
                      </button>
                  </div>
                </li>
              )}
            </ul>
          </nav>

          {/* PC 유틸 영역 */}
          <div className="hidden lg:flex items-center gap-5 shrink-0">
            {isLoggedIn ? (
              <>
                {/* 사용자 정보 */}
                <div className="flex items-center gap-1.5">
                  <Image
                    src="/asset/images/layout/icon_user.svg"
                    alt=""
                    width={24}
                    height={24}
                  />
                  <div className="flex items-center gap-2">
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      会社名の露出
                    </span>
                    <span className="w-px h-3 bg-[rgba(255,255,255,0.4)]" />
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      金志映
                    </span>
                  </div>
                </div>

                {/* 버튼 그룹 */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center justify-center h-[36px] bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.05)] rounded-[4px] overflow-hidden p-[10px]"
                  >
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-normal text-[#d1d1d1] whitespace-nowrap">
                      マイページ
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center gap-1.5 h-[36px] bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.05)] rounded-[4px] overflow-hidden p-[10px]"
                  >
                    <Image
                      src="/asset/images/layout/icon_logout.svg"
                      alt=""
                      width={16}
                      height={16}
                    />
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      ログアウト
                    </span>
                  </button>
                  {/* 톱니바퀴 (관리자) — 맨 오른쪽 */}
                  <button
                    type="button"
                    className="flex items-center justify-center size-[36px] bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.05)] rounded-[4px]"
                    aria-label="管理者設定"
                  >
                    <Image
                      src="/asset/images/layout/icon_admin.svg"
                      alt=""
                      width={21}
                      height={22}
                    />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <button
                    type="button"
                    className="flex items-center justify-center h-[36px] border border-orange-500 rounded-[4px] overflow-hidden p-[10px]"
                  >
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-normal text-white whitespace-nowrap">
                      ログイン
                    </span>
                  </button>
                </Link>
                <Link href="/signup">
                  <button
                    type="button"
                    className="flex items-center justify-center h-[36px] border border-[rgba(255,255,255,0.05)] rounded-[4px] overflow-hidden p-[10px]"
                  >
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-normal text-white whitespace-nowrap">
                      会員登録
                    </span>
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* 모바일 햄버거 메뉴 버튼 */}
          <button
            type="button"
            className="flex lg:hidden items-center justify-center size-6"
            aria-label="メニュー"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <Image
                src="/asset/images/layout/burger_btn.svg"
                alt=""
                width={24}
                height={24}
              />
            )}
          </button>
        </div>

        {/* 모바일 메뉴 패널 */}
        <div
          className={`fixed top-[60px] left-0 w-full h-[calc(100vh-60px)] bg-black transition-all duration-300 lg:hidden ${
            isMobileMenuOpen
              ? "opacity-100 visible translate-y-0"
              : "opacity-0 invisible -translate-y-2"
          }`}
        >
          <nav className="flex flex-col px-5 py-6">
            <ul className="flex flex-col gap-6">
              <li>
                <Link
                  href="#"
                  className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.4] text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  統合検索
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.4] text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  お知らせ
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.4] text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  資料ダウンロード
                </Link>
              </li>
              {isLoggedIn && (
                <li>
                  <Link
                    href="#"
                    className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.4] text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    関連サイト
                  </Link>
                </li>
              )}
            </ul>

            {/* 모바일 유틸 */}
            <div className="flex flex-col gap-3 mt-8 pt-6 border-t border-[rgba(255,255,255,0.15)]">
              {isLoggedIn ? (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Image
                      src="/asset/images/layout/icon_user.svg"
                      alt=""
                      width={24}
                      height={24}
                    />
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#d1d1d1]">
                      会社名の露出 | 金志映
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center h-[36px] bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.05)] rounded-[4px] p-[10px]"
                    >
                      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#d1d1d1]">
                        マイページ
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 h-[36px] bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.05)] rounded-[4px] p-[10px]"
                    >
                      <Image
                        src="/asset/images/layout/icon_logout.svg"
                        alt=""
                        width={16}
                        height={16}
                      />
                      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#d1d1d1]">
                        ログアウト
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center size-[36px] bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.05)] rounded-[4px]"
                      aria-label="管理者設定"
                    >
                      <Image
                        src="/asset/images/layout/icon_admin.svg"
                        alt=""
                        width={21}
                        height={22}
                      />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/login" className="flex-1" onClick={() => setIsMobileMenuOpen(false)}>
                    <button
                      type="button"
                      className="flex items-center justify-center w-full h-[36px] border border-orange-500 rounded-[4px] p-[10px]"
                    >
                      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-white">
                        ログイン
                      </span>
                    </button>
                  </Link>
                  <Link href="/signup" className="flex-1" onClick={() => setIsMobileMenuOpen(false)}>
                    <button
                      type="button"
                      className="flex items-center justify-center w-full h-[36px] border border-[rgba(255,255,255,0.05)] rounded-[4px] p-[10px]"
                    >
                      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-white">
                        会員登録
                      </span>
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
    </div>
  );
}
