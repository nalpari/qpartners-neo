import { redirect } from "next/navigation";
import { MypageInfo } from "@/components/mypage/info/mypage-info";

interface MypagePageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * 마이페이지 — 내 정보 / 회사 정보 (Redmine #2216 note-4 분리 후 info 전용).
 *
 * 구 URL 호환: `/mypage?tab=downloads` 진입 시 신규 경로(`/mypage/downloads`) 로 redirect.
 * RBAC 가드 + 공통 래퍼는 `src/app/mypage/layout.tsx` 가 처리.
 */
export default async function MypagePage({ searchParams }: MypagePageProps) {
  const params = await searchParams;
  if (params.tab === "downloads") {
    redirect("/mypage/downloads");
  }
  return <MypageInfo />;
}
