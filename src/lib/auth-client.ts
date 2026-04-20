import api from "@/lib/axios";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import type { QueryClient } from "@tanstack/react-query";
import type { LoginUser } from "@/lib/schemas/auth";

/**
 * 클라이언트 수정/삭제 권한 — 서버 canModifyResource 와 동기화
 * - SUPER_ADMIN: 모든 글
 * - ADMIN: 슈퍼관리자 작성글 제외 모든 글
 * - 그 외: 본인 작성글만
 *
 * authRole 미설정 과도기 폴백: userTp="ADMIN" 이면 ADMIN 으로 간주,
 * 그 외에는 role 없음으로 처리해 본인 매칭 쪽으로 보수적 폴백 (STORE/GENERAL 잘못 ADMIN 처리 방지).
 *
 * authorIsSuperAdmin이 undefined 인 경우(일반 사용자 응답에서 누락)에는 boolean 명시 비교로
 * `!undefined === true` 권한 우회를 차단 — 값이 확실히 false 로 내려왔을 때만 ADMIN 수정 허용.
 */
export function canModifyClient(
  user: LoginUser | null | undefined,
  resource: { userId: string; authorIsSuperAdmin?: boolean },
): boolean {
  if (!user) return false;
  const role = user.authRole ?? (user.userTp === "ADMIN" ? "ADMIN" : null);
  if (role === "SUPER_ADMIN") return true;
  if (role === "ADMIN") return resource.authorIsSuperAdmin === false;
  return user.userId === resource.userId;
}

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
