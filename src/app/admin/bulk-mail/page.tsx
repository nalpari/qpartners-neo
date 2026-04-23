import { BulkMailContents } from "@/components/admin/bulk-mail/bulk-mail-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_BULK_MAIL.canRead 매트릭스 가드.
 * 서버 최종 방어선은 `/api/admin/mass-mails/*` 의 `requireMenuPermission("ADM_BULK_MAIL", ...)`.
 */
export default async function AdminBulkMailPage() {
  await requirePageMenuPermission("ADM_BULK_MAIL", "read");
  return <BulkMailContents />;
}
