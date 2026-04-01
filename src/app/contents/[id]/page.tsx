import { ContentsDetail } from "@/components/contents/detail/contents-detail";

type Params = Promise<{ id: string }>;

export default async function ContentsDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return <ContentsDetail contentId={id} />;
}
