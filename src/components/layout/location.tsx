"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface LocationItem {
  icon: string;
  title: string;
  breadcrumbs: { label: string; href?: string }[];
}

const ROUTE_MAP: Record<string, LocationItem> = {
  "/login": {
    icon: "/asset/images/layout/login_location.svg",
    title: "ログイン",
    breadcrumbs: [{ label: "ログイン" }],
  },
  "/signup": {
    icon: "/asset/images/layout/signup_location.svg",
    title: "会員登録",
    breadcrumbs: [{ label: "会員登録" }],
  },
  "/contents": {
    icon: "/asset/images/layout/contents_location.svg",
    title: "コンテンツ",
    breadcrumbs: [{ label: "コンテンツ" }],
  },
  "/inquiry": {
    icon: "/asset/images/contents/inquiry_location.svg",
    title: "お問い合わせ",
    breadcrumbs: [{ label: "お問い合わせ" }],
  },
  "/admin": {
    icon: "/asset/images/layout/manage_location.svg",
    title: "マネージャー",
    breadcrumbs: [{ label: "マネージャー" }],
  },
};

function findLocation(pathname: string): LocationItem | null {
  // 정확한 경로 매칭 우선
  if (ROUTE_MAP[pathname]) return ROUTE_MAP[pathname];

  // 상위 경로로 올라가며 매칭 시도 (예: /contents/create → /contents)
  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 0) {
    segments.pop();
    const parentPath = `/${segments.join("/")}`;
    if (ROUTE_MAP[parentPath]) return ROUTE_MAP[parentPath];
  }

  return null;
}

export function Location() {
  const pathname = usePathname();

  const location = findLocation(pathname);

  if (!location) return null;

  return (
    <div className="flex flex-col items-center w-full bg-white lg:bg-[#F7F9FB]">
      <div className="flex items-center justify-between w-full max-w-[1440px] pt-[10px] pb-[10px] px-6 lg:pt-[42px] lg:pb-[24px] lg:px-0">
        {/* 좌측: 아이콘 + 타이틀 */}
        <div className="flex flex-1 items-center gap-1 pr-1">
          <div className="flex items-center justify-center size-10 shrink-0">
            <Image
              src={location.icon}
              alt=""
              width={40}
              height={40}
            />
          </div>
          <h1 className="font-['Noto_Sans_JP'] font-semibold text-[16px] lg:text-[20px] leading-[1.5] text-[#101010]">
            {location.title}
          </h1>
        </div>

        {/* 우측: 브레드크럼 */}
        <nav className="flex items-center gap-[10px] shrink-0">
          <Link href="/">
            <Image
              src="/asset/images/layout/home_location.svg"
              alt="Home"
              width={16}
              height={16}
            />
          </Link>

          {location.breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-[10px]">
              <svg width="5" height="8" viewBox="0 0 5 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 7L4 4L1 1" stroke="#101010" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-normal text-[#101010] whitespace-nowrap"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-normal text-[#101010] whitespace-nowrap">
                  {crumb.label}
                </span>
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
