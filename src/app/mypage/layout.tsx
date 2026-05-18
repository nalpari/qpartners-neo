import { Suspense } from "react";
import { MypageTab } from "@/components/layout/mypage-tab";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * /mypage 공통 레이아웃 — Redmine #2216 note-4 분리 후.
 *
 * - RBAC: MYPAGE.canRead 단일 매트릭스 가드 (info / downloads 동일 정책).
 * - 탭: MypageTab 이 pathname 기반으로 활성 탭 자동 판별 (`/mypage` → info,
 *   `/mypage/downloads` → downloads). 각 page 가 자체 children 만 렌더.
 * - GA: 두 페이지가 독립 라우트라 GA4 Enhanced Measurement 의 SPA navigation 자동
 *   page_view 가 `/mypage`, `/mypage/downloads` 를 각각 수집한다 (Redmine #2216 분리 측정 목적).
 */
export default async function MypageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePageMenuPermission("MYPAGE", "read");

  return (
    <Suspense>
      <MypageTab />
      <main className="flex flex-col items-center w-full bg-[#f7f9fb] overflow-hidden">
        <div className="w-full flex flex-col items-center gap-[42px] lg:py-[24px] lg:pb-[48px] pb-[0px]">
          {children}
        </div>
      </main>
    </Suspense>
  );
}
