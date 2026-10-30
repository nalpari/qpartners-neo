import { ProductModelsContents } from "@/components/admin/product-models/product-models-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * 형번관리 (型番管理) — 검색기능 고도화 REQ-007.
 *
 * RBAC — ADM_PRODUCT_MODEL.canRead 매트릭스 가드.
 * 서버 최종 방어선은 `/api/product-models/*` 의 권한 체크.
 */
export default async function AdminProductModelsPage() {
  await requirePageMenuPermission("ADM_PRODUCT_MODEL", "read");
  return <ProductModelsContents />;
}
