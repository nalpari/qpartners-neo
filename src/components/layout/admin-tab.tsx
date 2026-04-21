"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMenuTree } from "@/hooks/use-menu-tree";
import type { MenuApiItem, MenuTreeItem } from "@/components/admin/menus/menus-types";

// 하드코딩 fallback — API 로딩 전 또는 실패 시 표시
const FALLBACK_TABS = [
  { label: "会員管理", href: "/admin/members" },
  { label: "バルクメール発送", href: "/admin/bulk-mail" },
  { label: "ホーム画面のお知らせ", href: "/admin/notices" },
  { label: "カテゴリ管理", href: "/admin/categories" },
  { label: "権限管理", href: "/admin/permissions" },
  { label: "メニュー管理", href: "/admin/menus" },
  { label: "コード管理", href: "/admin/codes" },
];

/** 관리자(ADMIN) 1-Level 메뉴의 2-Level children을 탭으로 변환 */
function toTabs(menuTree: MenuTreeItem[]) {
  const adminMenu = menuTree.find(
    (m) => m.menuCode === "ADMIN" || m.pageUrl === "/admin",
  );
  if (!adminMenu) {
    console.warn("[AdminTab] ADMIN 메뉴를 찾을 수 없습니다. fallback 탭을 표시합니다.");
    return null;
  }
  if (adminMenu.children.length === 0) return null;

  return adminMenu.children
    .filter((c): c is MenuApiItem & { pageUrl: string } =>
      c.isActive && typeof c.pageUrl === "string" && c.pageUrl.length > 0
      && c.pageUrl.startsWith("/") && !c.pageUrl.startsWith("//")
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ label: c.menuName, href: c.pageUrl }));
}

export function AdminTab() {
  const pathname = usePathname();

  const { data: menuTree, isError, error } = useMenuTree();

  if (isError) {
    console.error("[AdminTab] 메뉴 API 조회 실패:", error);
  }

  const tabs = (menuTree && toTabs(menuTree)) ?? FALLBACK_TABS;

  return (
    <nav className="flex gap-1 w-full max-w-[1440px] pb-[32px]">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
