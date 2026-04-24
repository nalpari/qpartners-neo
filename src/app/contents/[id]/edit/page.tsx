import { ContentsForm } from "@/components/contents/create/contents-form";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

type Params = Promise<{ id: string }>;

/**
 * RBAC — 콘텐츠 수정 페이지 서버 가드.
 * CONTENT.canUpdate 매트릭스 false → 상세 페이지로 redirect.
 * 서버 최종 방어선은 `PUT /api/contents/:id` 의 requireMenuPermission.
 */
export default async function ContentsEditPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  await requirePageMenuPermission("CONTENT", "update", { fallback: `/contents/${id}` });
  return <ContentsForm mode="edit" contentId={id} />;
}
