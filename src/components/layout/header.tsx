"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { loginUserSchema } from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { AUTH_FLAG_KEY } from "@/components/login/types";

async function fetchAuthMe(): Promise<LoginUser | null> {
  try {
    const res = await api.get("/auth/me");
    const parsed = loginUserSchema.safeParse(res.data?.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const ALL_RELATED_SITES = [
  { label: "QSP", value: "qsp", href: "https://jp-dev.qsalesplatform.com" },
  { label: "HANASYS DESIGN", value: "hanasys", href: "https://hanasys.co.jp" },
  { label: "Q.ORDER", value: "qorder", href: "https://qorder.hanasys.co.jp" },
  { label: "Q.MUSUBI", value: "qmusubi", href: "https://qmusubi.hanasys.co.jp" },
  { label: "Q.WARRANTY", value: "qwarranty", href: "https://qwarranty.hanasys.co.jp" },
] as const;

const SITE_ACCESS_MAP: Record<string, string[]> = {
  ADMIN: ["qsp", "qorder", "qmusubi", "qwarranty", "hanasys"],
  DEALER_1: ["qorder", "qwarranty", "hanasys"],
  DEALER_2: ["qmusubi", "qwarranty", "hanasys"],
};

function getUserSiteKey(user: LoginUser): string | null {
  if (user.userTp === "ADMIN") return "ADMIN";
  if (user.userTp === "DEALER") {
    if (user.storeLvl === "1") return "DEALER_1";
    if (user.storeLvl === "2") return "DEALER_2";
  }
  return null;
}

function getRelatedSites(user: LoginUser) {
  const key = getUserSiteKey(user);
  if (!key) return [];
  const allowed = SITE_ACCESS_MAP[key] ?? [];
  return ALL_RELATED_SITES.filter((site) => allowed.includes(site.value));
}

const noopSubscribe = () => () => {};

export function Gnb() {
  const hasAuthFlag = useSyncExternalStore(
    noopSubscribe,
    () => localStorage.getItem(AUTH_FLAG_KEY) === "1",
    () => false,
  );

  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "me"],
    queryFn: fetchAuthMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: null,
    enabled: hasAuthFlag,
  });
  const queryClient = useQueryClient();
  const router = useRouter();

  const isLoggedIn = user != null;
  const isAdmin = user?.userTp === "ADMIN";
  const relatedSites = user ? getRelatedSites(user) : [];
  const showRelatedSites = relatedSites.length > 0;

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.warn("[logout] ログアウトAPI失敗:", error);
    } finally {
      localStorage.removeItem(AUTH_FLAG_KEY);
      queryClient.clear();
      router.push("/login");
    }
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSitesOpen, setIsMobileSitesOpen] = useState(false);

  return (
    <div className="relative h-[68px] lg:h-[78px]">
      <header className="fixed top-0 left-0 flex items-center justify-center w-full bg-black z-9999 h-[68px] lg:h-[78px] py-4.5" style={{ viewTransitionName: "header" }}>
        <div className="flex items-center justify-between w-full max-w-[1440px] px-5 lg:px-0">
          {/* PC 로고 — 가로 1줄 */}
          <Link href="/" className="hidden lg:flex items-center gap-2 shrink-0 relative">
            <Image
              src="/asset/images/layout/logo_hanwha.svg"
              alt="Hanwha Japan"
              width={160}
              height={30}
              unoptimized
              style={{ height: "auto"}}
              loading="eager"
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
              unoptimized
              style={{ height: "auto" }}
            />
            <span className="font-pretendard font-medium text-[12px] leading-[1.5] text-white uppercase whitespace-nowrap pl-[30px]">
              Q.PARTNERS
            </span>
          </Link>

          {/* PC 메뉴 영역 */}
          <nav className="hidden lg:flex flex-1 items-center self-stretch">
            <ul className="flex items-center gap-[54px] pl-[60px]">
              <li>
                <Link
                  href="/contents"
                  transitionTypes={["fade"]}
                  className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap transition-colors duration-200 hover:text-[#e97923]"
                >
                  コンテンツ
                </Link>
              </li>
              <li>
                <Link
                  href="/inquiry"
                  transitionTypes={["fade"]}
                  className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap transition-colors duration-200 hover:text-[#e97923]"
                >
                  お問い合わせ
                </Link>
              </li>
              {showRelatedSites && (
                <li className="relative">
                  <button
                    type="button"
                    className={`group flex items-center gap-1 font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] whitespace-nowrap transition-colors duration-200 ${
                      isDropdownOpen
                        ? "text-[#e97923]"
                        : "text-white hover:text-[#e97923]"
                    }`}
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                  >
                    関連サイト
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="transition-all duration-200"
                    >
                      <path
                        d={isDropdownOpen
                          ? "M5 7.5L10 12.5L15 7.5"
                          : "M7.5 15L12.5 10L7.5 5"
                        }
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {/* 関連サイト 드롭다운 패널 */}
                  <div
                    className={`absolute top-full left-0 mt-2 w-[200px] bg-white border border-black rounded-[12px] pt-[16px] pb-[24px] px-[18px] shadow-[0px_6px_32px_0px_rgba(0,0,0,0.05)] transition-all duration-200 ${
                      isDropdownOpen
                        ? "opacity-100 visible translate-y-0"
                        : "opacity-0 invisible -translate-y-1"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-[14px] border-b border-black">
                      <span className="font-['Noto_Sans_JP'] font-medium text-[13px] text-[#101010] leading-normal overflow-hidden text-ellipsis whitespace-nowrap">
                        関連サイト
                      </span>
                      <button
                        type="button"
                        aria-label="閉じる"
                        className="flex items-center justify-center size-[22px] bg-white rounded-full"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M9 1L1 9M1 1l8 8"
                            stroke="#000"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <ul className="flex flex-col gap-[13px]">
                      {relatedSites.map((site) => (
                        <li key={site.value}>
                          <a
                            href={site.href}
                            className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-normal overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-200 text-[#101010] hover:text-[#e97923]"
                            onClick={() => setIsDropdownOpen(false)}
                          >
                            {site.label}
                          </a>
                        </li>
                      ))}
                    </ul>
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
                      {user?.compNm ?? "-"}
                    </span>
                    <span className="w-px h-3 bg-[rgba(255,255,255,0.4)]" />
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      {user?.userNm ?? ""}
                    </span>
                  </div>
                </div>

                {/* 버튼 그룹 */}
                <div className="flex items-center gap-2">
                  <Link
                    href="/mypage"
                    transitionTypes={["fade"]}
                    className="flex items-center justify-center h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                  >
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      マイページ
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-1.5 h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
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
                  {/* 톱니바퀴 (管理者) — 관리자만 노출 */}
                  {isAdmin && <Link
                    href="/admin/members"
                    transitionTypes={["fade"]}
                    className="flex items-center justify-center size-[36px] bg-[#252525] border border-[#313131] rounded-[4px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                    aria-label="管理者設定"
                  >
                    <Image
                      src="/asset/images/layout/icon_admin.svg"
                      alt=""
                      width={21}
                      height={22}
                    />
                  </Link>}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="flex items-center justify-center h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                >
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                    ログイン
                  </span>
                </Link>
                <Link
                  href="/signup"
                  className="flex items-center justify-center h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                >
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                    会員登録
                  </span>
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

        {/* 모바일 메뉴 — 딤 + 슬라이드 패널 */}
        {/* 딤 배경 */}
        <div
          className={`fixed inset-0 bg-[rgba(0,0,0,0.7)] transition-opacity duration-300 lg:hidden ${
            isMobileMenuOpen
              ? "opacity-100 visible"
              : "opacity-0 invisible"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* 슬라이드 패널 */}
        <div
          className={`fixed top-0 right-0 w-full max-w-[375px] h-full bg-black flex flex-col px-5 py-8 transition-transform duration-300 lg:hidden ${
            isMobileMenuOpen
              ? "translate-x-0"
              : "translate-x-full"
          }`}
        >
          {/* 상단: 유저 정보 + 닫기 */}
          <div className="flex items-start gap-12 mb-8">
            {isLoggedIn ? (
              <div className="flex flex-1 items-center gap-3">
                <div className="shrink-0 size-16 bg-white rounded-full overflow-hidden">
                  <Image
                    src="/asset/images/layout/icon_user.svg"
                    alt=""
                    width={64}
                    height={64}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-[1.5] text-white">
                    {user?.compNm ?? "-"}
                  </span>
                  <span className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-[1.5] text-[#e97923]">
                    {user?.userNm ?? ""}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <button
              type="button"
              className="flex items-center justify-center size-8 bg-[#202020] rounded-full shrink-0"
              aria-label="閉じる"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsMobileSitesOpen(false);
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11 1L1 11M1 1l10 10"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* 네비게이션 */}
          <nav className="flex flex-col flex-1">
            {/* コンテンツ */}
            <Link
              href="/contents"
              transitionTypes={["fade"]}
              className="flex items-center justify-between px-3 py-[18px] border-b border-[#1a1a1a]"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white">
                コンテンツ
              </span>
              <svg
                width="6"
                height="10"
                viewBox="0 0 6 10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 9L5 5L1 1"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            {/* お問い合わせ */}
            <Link
              href="/inquiry"
              transitionTypes={["fade"]}
              className="flex items-center justify-between px-3 py-[18px] border-b border-[#1a1a1a]"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white">
                お問い合わせ
              </span>
              <svg
                width="6"
                height="10"
                viewBox="0 0 6 10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 9L5 5L1 1"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            {/* 関連サイト — 토글 (회원유형별 노출) */}
            {showRelatedSites && <div className="border-b border-[#1a1a1a]">
              <button
                type="button"
                className="flex items-center justify-between w-full px-3 py-[18px]"
                onClick={() => setIsMobileSitesOpen((prev) => !prev)}
              >
                <span className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white">
                  関連サイト
                </span>
                <svg
                  width="6"
                  height="10"
                  viewBox="0 0 6 10"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className={`transition-transform duration-200 ${
                    isMobileSitesOpen ? "rotate-90" : ""
                  }`}
                >
                  <path
                    d="M1 9L5 5L1 1"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* 2depth 사이트 링크 */}
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  isMobileSitesOpen ? "max-h-[300px] pb-4" : "max-h-0"
                }`}
              >
                <ul className="flex flex-col gap-3 pl-6 pr-3">
                  {relatedSites.map((site) => (
                    <li key={site.value}>
                      <a
                        href={site.href}
                        className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] transition-colors duration-200 text-[#999] font-normal"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {site.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>}
          </nav>

          {/* 하단 바 */}
          <div className="bg-[#121212] rounded-[12px] py-[14px] mt-auto">
            {isLoggedIn ? (
              <div className="flex items-center justify-around px-7">
                <Link
                  href="/mypage"
                  transitionTypes={["fade"]}
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] text-white whitespace-nowrap"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  マイページ
                </Link>
                <span className="w-px h-[10px] bg-[#5b5b5b]" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.4] text-white uppercase whitespace-nowrap"
                >
                  ログアウト
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4 px-7">
                <Link
                  href="/login"
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] text-white whitespace-nowrap"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  ログイン
                </Link>
                <span className="w-px h-[10px] bg-[#5b5b5b]" />
                <Link
                  href="/signup"
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] text-white whitespace-nowrap"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  会員登録
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
