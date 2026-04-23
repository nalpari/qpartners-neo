import { MembersContents } from "@/components/admin/members/members-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_MEMBER.canRead 매트릭스 가드.
 * admin/layout 이 isAdmin 은 통과시키므로, 2-level 세부 메뉴 read 권한은 여기서 재검증.
 * 서버 최종 방어선은 각 members API 의 `requireMenuPermission("ADM_MEMBER", ...)`.
 */
export default async function AdminMembersPage() {
  await requirePageMenuPermission("ADM_MEMBER", "read");
  return <MembersContents />;
}
