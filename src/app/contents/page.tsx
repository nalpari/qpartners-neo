import { Suspense } from "react";
import { ContentsContents } from "@/components/contents/list/contents-contents";
import { Spinner } from "@/components/common";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

export default async function ContentsPage() {
  // CONTENT.canRead 매트릭스 가드 — false 시 홈으로 redirect
  await requirePageMenuPermission("CONTENT", "read");
  return (
    <Suspense fallback={<div className="flex items-center justify-center w-full py-20"><Spinner size={48} /></div>}>
      <ContentsContents />
    </Suspense>
  );
}
