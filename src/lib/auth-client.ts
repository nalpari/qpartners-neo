import api from "@/lib/axios";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import type { QueryClient } from "@tanstack/react-query";

/**
 * 클라이언트 사이드 로그아웃 처리
 * - /api/auth/logout 호출 (실패해도 로컬 상태 정리)
 * - AUTH_FLAG_KEY 제거 + 이벤트 발행
 * - TanStack Query 캐시 전체 클리어
 */
export async function performLogout(queryClient: QueryClient): Promise<void> {
  try {
    await api.post("/auth/logout");
  } catch (error) {
    console.warn("[logout] ログアウトAPI失敗:", error);
  } finally {
    localStorage.removeItem(AUTH_FLAG_KEY);
    dispatchAuthChange();
    queryClient.clear();
  }
}
