import { DownloadHistory } from "@/components/mypage/downloads/download-history";

/**
 * 마이페이지 — 다운로드 내역 (Redmine #2216 note-4 분리 후 신규).
 *
 * RBAC 가드 + 공통 래퍼는 `src/app/mypage/layout.tsx` 가 처리.
 */
export default function MypageDownloadsPage() {
  return <DownloadHistory />;
}
