"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMenuTree } from "@/hooks/use-menu-tree";
import { useMenuPermissionMap } from "@/hooks/use-menu-permission";
import { MENU, ADMIN_MENU } from "@/lib/menu-codes";
import type { MenuApiItem, MenuTreeItem } from "@/components/admin/menus/menus-types";

interface AdminTabItem {
  label: string;
  href: string;
  menuCode: string | null; // fallback 탭은 null — 권한 필터 통과
}

// 하드코딩 fallback — API 로딩 전 또는 실패 시 표시
const FALLBACK_TABS: AdminTabItem[] = [
  { label: "会員管理", href: "/admin/members", menuCode: ADMIN_MENU.MEMBERS },
  { label: "バルクメール発送", href: "/admin/bulk-mail", menuCode: ADMIN_MENU.BULK_MAIL },
  { label: "ホーム画面のお知らせ", href: "/admin/notices", menuCode: ADMIN_MENU.NOTICES },
  { label: "カテゴリ管理", href: "/admin/categories", menuCode: ADMIN_MENU.CATEGORIES },
  { label: "権限管理", href: "/admin/permissions", menuCode: ADMIN_MENU.PERMISSIONS },
  { label: "メニュー管理", href: "/admin/menus", menuCode: ADMIN_MENU.MENUS },
  { label: "コード管理", href: "/admin/codes", menuCode: ADMIN_MENU.CODES },
];

/** 관리자(ADMIN) 1-Level 메뉴의 2-Level children을 탭으로 변환 */
function toTabs(menuTree: MenuTreeItem[]): AdminTabItem[] | null {
  const adminMenu = menuTree.find(
    (m) => m.menuCode === MENU.ADMIN || m.pageUrl === "/admin",
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
    .map((c) => ({ label: c.menuName, href: c.pageUrl, menuCode: c.menuCode }));
}

export function AdminTab() {
  const pathname = usePathname();

  const { data: menuTree, isError, error } = useMenuTree();
  // 현재 사용자의 menuCode 별 canRead 체크 — IS_STUB 동안은 항상 true 로 탭 전부 노출.
  // BE 연결 후에는 canRead=false 탭은 자동 숨김 (fail-closed).
  const { has } = useMenuPermissionMap();

  if (isError) {
    console.error("[AdminTab] 메뉴 API 조회 실패:", error);
  }

  const rawTabs = (menuTree && toTabs(menuTree)) ?? FALLBACK_TABS;
  const tabs = rawTabs.filter((t) => !t.menuCode || has(t.menuCode, "read"));

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
