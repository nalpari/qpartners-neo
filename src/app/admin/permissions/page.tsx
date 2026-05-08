import { PermissionsContents } from "@/components/admin/permissions/permissions-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/** RBAC — ADM_PERMISSION.canRead 매트릭스 가드. */
export default async function AdminPermissionsPage() {
  await requirePageMenuPermission("ADM_PERMISSION", "read");
  return <PermissionsContents />;
}
