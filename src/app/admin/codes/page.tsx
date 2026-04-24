import { CodesContents } from "@/components/admin/codes/codes-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_CODE.canRead 매트릭스 가드.
 * CUD 는 SUPER_ADMIN 전용 (ADMIN_RESTRICTED_MENUS).
 */
export default async function AdminCodesPage() {
  await requirePageMenuPermission("ADM_CODE", "read");
  return <CodesContents />;
}
