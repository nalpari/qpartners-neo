import { PermissionsContents } from "@/components/admin/permissions/permissions-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_PERMISSION.canRead 매트릭스 가드.
 * CUD 는 SUPER_ADMIN 전용 (ADMIN_RESTRICTED_MENUS) — `PUT /api/roles/:rc/permissions` 가 방어.
 */
export default async function AdminPermissionsPage() {
  await requirePageMenuPermission("ADM_PERMISSION", "read");
  return <PermissionsContents />;
}
