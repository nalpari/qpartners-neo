import { Suspense } from "react";
import { ContentsContents } from "@/components/contents/list/contents-contents";
import { Spinner } from "@/components/common";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string | string[] }>;
}) {
  // CONTENT.canRead 매트릭스 가드 — false 시 홈으로 redirect.
  // `/api/contents` GET 은 PUBLIC_GET_PATTERNS 로 비회원 접근 허용이므로 페이지도 동일 정책 유지
  // (`allowAnonymous: true`). 로그인 사용자만 매트릭스 canRead 재검증한다.
  await requirePageMenuPermission("CONTENT", "read", { allowAnonymous: true });

  // 홈 검색바(useHomeSearch)의 router.push("/contents?keyword=...") 외부 진입 흡수.
  // 서버에서 searchParams 로 keyword 를 확정해 prop + key 로 전달 → 클라이언트가
  // window.location.search 를 직접 읽을 때 발생하던 race(진입 타이밍)와
  // 라우터 캐시로 인한 재마운트 누락(같은 keyword 흡수 실패)을 동시에 차단한다.
  const { keyword } = await searchParams;
  const initialKeyword = typeof keyword === "string" ? keyword : "";

  return (
    <Suspense fallback={<div className="flex items-center justify-center w-full py-20"><Spinner size={48} /></div>}>
      {/* key 로 keyword 변경 시 리마운트 강제 — useState 초기화를 재실행해 새 keyword 흡수 */}
      <ContentsContents key={initialKeyword} initialKeyword={initialKeyword} />
    </Suspense>
  );
}
