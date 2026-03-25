"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminTabKey =
  | "members"
  | "bulk-mail"
  | "notices"
  | "categories"
  | "permissions"
  | "menus"
  | "codes";

interface TabItem {
  key: AdminTabKey;
  label: string;
  href: string;
}

const TABS: TabItem[] = [
  { key: "members", label: "会員管理", href: "/admin/members" },
  { key: "bulk-mail", label: "バルクメール発送", href: "/admin/bulk-mail" },
  { key: "notices", label: "ホーム画面のお知らせ", href: "/admin/notices" },
  { key: "categories", label: "カテゴリ管理", href: "/admin/categories" },
  { key: "permissions", label: "権限管理", href: "/admin/permissions" },
  { key: "menus", label: "メニュー管理", href: "/admin/menus" },
  { key: "codes", label: "コード管理", href: "/admin/codes" },
];

export function AdminTab() {
  const pathname = usePathname();

  function isActive(tab: TabItem): boolean {
    return pathname.startsWith(tab.href);
  }

  return (
    <nav className="flex gap-1 w-full max-w-[1440px]">
      {TABS.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            transitionTypes={["fade"]}
            className={`flex flex-1 items-center justify-center py-4 rounded-[6px] font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-center transition-colors ${
              active
                ? "bg-[#e97923] text-white"
                : "bg-white border border-[#edeeef] text-[#101010] hover:bg-[#f5f5f5]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
