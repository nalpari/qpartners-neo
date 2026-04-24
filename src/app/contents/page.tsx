import { Suspense } from "react";
import { ContentsContents } from "@/components/contents/list/contents-contents";
import { Spinner } from "@/components/common";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

export default async function ContentsPage() {
  // CONTENT.canRead 매트릭스 가드 — false 시 홈으로 redirect.
  // `/api/contents` GET 은 PUBLIC_GET_PATTERNS 로 비회원 접근 허용이므로 페이지도 동일 정책 유지
  // (`allowAnonymous: true`). 로그인 사용자만 매트릭스 canRead 재검증한다.
  await requirePageMenuPermission("CONTENT", "read", { allowAnonymous: true });
  return (
    <Suspense fallback={<div className="flex items-center justify-center w-full py-20"><Spinner size={48} /></div>}>
      <ContentsContents />
    </Suspense>
  );
}
