import { CategoriesContents } from "@/components/admin/categories/categories-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — ADM_CATEGORY.canRead 매트릭스 가드.
 * 서버 최종 방어선은 `/api/categories/*` 의 권한 체크.
 */
export default async function AdminCategoriesPage() {
  await requirePageMenuPermission("ADM_CATEGORY", "read");
  return <CategoriesContents />;
}
