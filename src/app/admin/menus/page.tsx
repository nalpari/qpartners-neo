import { MenusContents } from "@/components/admin/menus/menus-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/** RBAC — ADM_MENU.canRead 매트릭스 가드. */
export default async function AdminMenusPage() {
  await requirePageMenuPermission("ADM_MENU", "read");
  return <MenusContents />;
}
