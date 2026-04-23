import { MenusContents } from "@/components/admin/menus/menus-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_MENU.canRead 매트릭스 가드.
 * CUD 는 SUPER_ADMIN 전용 (ADMIN_RESTRICTED_MENUS).
 */
export default async function AdminMenusPage() {
  await requirePageMenuPermission("ADM_MENU", "read");
  return <MenusContents />;
}
