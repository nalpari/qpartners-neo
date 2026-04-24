import { NoticesContents } from "@/components/admin/notices/notices-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_NOTICE.canRead 매트릭스 가드.
 * 서버 최종 방어선은 `/api/home-notices/*` 의 권한 체크.
 */
export default async function AdminNoticesPage() {
  await requirePageMenuPermission("ADM_NOTICE", "read");
  return <NoticesContents />;
}
