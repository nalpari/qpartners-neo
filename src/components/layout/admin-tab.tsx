"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMenuTree } from "@/hooks/use-menu-tree";
import { MENU } from "@/lib/menu-codes";
import type { MenuApiItem, MenuTreeItem } from "@/components/admin/menus/menus-types";

interface AdminTabItem {
  label: string;
  href: string;
}

// 하드코딩 fallback — API 로딩 전 또는 실패 시 표시
const FALLBACK_TABS: AdminTabItem[] = [
  { label: "会員管理", href: "/admin/members" },
  { label: "バルクメール発送", href: "/admin/bulk-mail" },
  { label: "ホーム画面のお知らせ", href: "/admin/notices" },
  { label: "カテゴリ管理", href: "/admin/categories" },
  { label: "権限管理", href: "/admin/permissions" },
  { label: "メニュー管理", href: "/admin/menus" },
  { label: "コード管理", href: "/admin/codes" },
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

  const tabs = adminMenu.children
    .filter((c): c is MenuApiItem & { pageUrl: string } =>
      c.isActive && typeof c.pageUrl === "string" && c.pageUrl.length > 0
      && c.pageUrl.startsWith("/") && !c.pageUrl.startsWith("//")
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c): AdminTabItem => ({ label: c.menuName, href: c.pageUrl }));

  // pageUrl 중복 제거 — DB 에 같은 pageUrl 을 가진 메뉴가 들어오면 React key 중복 에러 발생.
  // 최초 등장한 행만 유지. 시드/메뉴관리 정합성 문제이므로 error 로 기록해 운영 알람에 노출.
  const deduped = new Map<string, AdminTabItem>();
  for (const tab of tabs) {
    if (deduped.has(tab.href)) {
      console.error(`[AdminTab] pageUrl 중복 감지 — drop: ${tab.href} (${tab.label})`);
      continue;
    }
    deduped.set(tab.href, tab);
  }
  // 빈 배열은 truthy 라 호출부의 `?? FALLBACK_TABS` 가 발동하지 않아 관리자 UI 가 완전히 공백이 됨.
  // null 로 명시 반환해 fallback 경로를 확실히 활성화.
  const result = Array.from(deduped.values());
  return result.length > 0 ? result : null;
}

export function AdminTab() {
  const pathname = usePathname();

  const { data: menuTree, isError, error } = useMenuTree();

  if (isError) {
    console.error("[AdminTab] 메뉴 API 조회 실패:", error);
  }

  // 관리자 탭은 항상 표시. admin/layout 서버 가드가 이미 ADMIN/SUPER_ADMIN 만 페이지 진입 허용하므로
  // 2차 menuCode 권한 필터는 불필요하고, BE me/permissions 와 DB menuCode(레거시 ADM_*) 불일치
  // 시 탭이 통째로 숨겨지는 UX 장애 유발. 세부 액션 차단은 각 버튼 onClick 가드 + 서버 403 에 일임.
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
