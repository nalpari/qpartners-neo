import { requirePageMenuPermission } from "@/lib/rbac-guard";
import { BulkMailDetailClient } from "./bulk-mail-detail-client";

/**
 * RBAC — ADM_BULK_MAIL.canRead 매트릭스 가드. server wrapper 로 진입 자체를 차단.
 * 서버 최종 방어선은 `/api/admin/mass-mails/[id]` 의 `requireMenuPermission("ADM_BULK_MAIL", "read")`.
 *
 * client 본체는 useQuery 와 useState 를 사용해야 해서 별도 컴포넌트로 분리.
 */
export default async function AdminBulkMailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageMenuPermission("ADM_BULK_MAIL", "read", { fallback: "/admin/bulk-mail" });
  const { id } = await params;
  return <BulkMailDetailClient id={id} />;
}
