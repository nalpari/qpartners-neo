import { Suspense } from "react";
import { MypageContents } from "@/components/mypage/mypage-contents";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

export default async function MypagePage() {
  // MYPAGE.canRead 매트릭스 가드
  await requirePageMenuPermission("MYPAGE", "read");
  return (
    <Suspense>
      <MypageContents />
    </Suspense>
  );
}
