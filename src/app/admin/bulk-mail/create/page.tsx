import { requirePageMenuPermission } from "@/lib/rbac-guard";
import { BulkMailCreateClient } from "./bulk-mail-create-client";

/**
 * RBAC — ADM_BULK_MAIL.canCreate 매트릭스 가드. server wrapper 로 진입 자체를 차단.
 * 서버 최종 방어선은 `/api/admin/mass-mails (POST)` 의 `requireMenuPermission("ADM_BULK_MAIL", "create")`.
 * 페이지 가드 미통과 시 fallback (`/admin/bulk-mail`) 으로 redirect — 화면 차단 명시화.
 *
 * client 본체는 sessionStorage 복사 데이터 로드가 필요해 별도 컴포넌트로 분리.
 */
export default async function AdminBulkMailCreatePage() {
  await requirePageMenuPermission("ADM_BULK_MAIL", "create", { fallback: "/admin/bulk-mail" });
  return <BulkMailCreateClient />;
}
