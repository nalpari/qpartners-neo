import { ContentsForm } from "@/components/contents/create/contents-form";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * RBAC — 콘텐츠 신규 등록 페이지 서버 가드.
 * CONTENT.canCreate 매트릭스 false → `/contents` redirect.
 * 서버 최종 방어선은 `POST /api/contents` 의 requireMenuPermission.
 */
export default async function ContentsCreatePage() {
  await requirePageMenuPermission("CONTENT", "create", { fallback: "/contents" });
  return <ContentsForm mode="create" />;
}
