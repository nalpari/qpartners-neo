"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMenuTree } from "@/hooks/use-menu-tree";
import { useMenuPermissionMap } from "@/hooks/use-menu-permission";
import { ADMIN_MENU, MENU } from "@/lib/menu-codes";
import type { MenuApiItem, MenuTreeItem } from "@/components/admin/menus/menus-types";
import type { MenuCode } from "@/lib/schemas/common";

interface AdminTabItem {
  /** 매트릭스 필터용 — `has(menuCode, "read")` 호출 */
  menuCode: MenuCode;
  label: string;
  href: string;
}

/**
 * 하드코딩 fallback — API 로딩 전 또는 실패 시 표시.
 * 각 탭에 `menuCode` 를 붙여 매트릭스 read 필터가 가능하도록 한다.
 */
const FALLBACK_TABS: AdminTabItem[] = [
  { menuCode: ADMIN_MENU.MEMBERS,     label: "会員管理",         href: "/admin/members"     },
  { menuCode: ADMIN_MENU.BULK_MAIL,   label: "バルクメール発送", href: "/admin/bulk-mail"   },
  { menuCode: ADMIN_MENU.NOTICES,     label: "ホーム画面のお知らせ", href: "/admin/notices" },
  { menuCode: ADMIN_MENU.CATEGORIES,  label: "カテゴリ管理",     href: "/admin/categories"  },
  { menuCode: ADMIN_MENU.PERMISSIONS, label: "権限管理",         href: "/admin/permissions" },
  { menuCode: ADMIN_MENU.MENUS,       label: "メニュー管理",     href: "/admin/menus"       },
  { menuCode: ADMIN_MENU.CODES,       label: "コード管理",       href: "/admin/codes"       },
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
    // DB menuCode 가 MenuCode 유니언 밖이면 매트릭스 필터에서 자연스레 `has()`=false 로 드롭됨.
    // 타입 안전 상 `as MenuCode` 로 좁히되 실제 체크는 has() 가 담당.
    .map((c): AdminTabItem => ({
      menuCode: c.menuCode as MenuCode,
      label: c.menuName,
      href: c.pageUrl,
    }));

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
  const { has } = useMenuPermissionMap();

  if (isError) {
    console.error("[AdminTab] 메뉴 API 조회 실패:", error);
  }

  // 매트릭스 기반 필터 — `has()` 는 로딩 중 permissive(true) 반환이라 네비 플래시 없음.
  // 데이터 수신 후 canRead=false 인 탭은 자연스럽게 숨겨진다. 서버 페이지 가드
  // (`requirePageMenuPermission`) 가 최종 방어선이므로 UX 수렴 + 보안 일관성 확보.
  const rawTabs = (menuTree && toTabs(menuTree)) ?? FALLBACK_TABS;
  const tabs = rawTabs.filter((t) => has(t.menuCode, "read"));

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
