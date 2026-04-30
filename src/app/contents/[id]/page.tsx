import { ContentsDetail } from "@/components/contents/detail/contents-detail";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

type Params = Promise<{ id: string }>;

export default async function ContentsDetailPage({
  params,
}: {
  params: Params;
}) {
  // CONTENT.canRead 매트릭스 가드 — 목록 페이지와 동일.
  // `/api/contents/:id` GET 은 PUBLIC_GET_PATTERNS 로 비회원 접근 허용이고,
  // ContentTarget 에 non_member 가 포함된 상세는 비회원도 열람 가능해야 한다.
  // 따라서 페이지 진입은 익명 통과시키고, 실제 접근 결정은 BE 의 canAccessContent
  // (targetType + publication window) 가 담당한다 — non_member 미포함 시 403.
  await requirePageMenuPermission("CONTENT", "read", { allowAnonymous: true });
  const { id } = await params;
  return <ContentsDetail contentId={id} />;
}
