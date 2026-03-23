import { ContentsForm } from "@/components/contents/contents-form";

type Params = Promise<{ id: string }>;

export default async function ContentsEditPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return <ContentsForm mode="edit" contentId={id} />;
}
