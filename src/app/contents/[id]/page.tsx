import { ContentsDetail } from "@/components/contents/detail/contents-detail";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

type Params = Promise<{ id: string }>;

export default async function ContentsDetailPage({
  params,
}: {
  params: Params;
}) {
  // CONTENT.canRead 매트릭스 가드 — 목록 페이지와 동일
  await requirePageMenuPermission("CONTENT", "read");
  const { id } = await params;
  return <ContentsDetail contentId={id} />;
}
