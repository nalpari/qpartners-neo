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
 * - 진행 중인 쿼리 취소 (재요청 유발 없음)
 *
 * ⚠️ 캐시 `clear()` 를 여기서 하지 않는다:
 *   로그아웃 순간에는 현재 화면(회원관리 등)이 아직 마운트되어 있어, `clear()` 가 활성 쿼리
 *   (회원목록/메뉴 등, 로그인 게이팅이 없는 쿼리)의 즉시 재요청을 유발한다. 이때 서버는 이미
 *   쿠키를 삭제한 상태라 401 이 발생한다.
 *   대신 위 `dispatchAuthChange()` 가 QueryProvider 의 로그아웃 전환 분기를 트리거해
 *   `["auth","login-user-info"]`(user) 캐시만 즉시 null 처리한다(헤더 등 user 파생 UI 정리, 재요청 없음).
 *   전체 캐시 purge(`clear()`)는 화면 언마운트 이후 시점, 즉 다음 로그인 전환에서 QueryProvider 가 1회 수행한다.
 */
export async function performLogout(queryClient: QueryClient): Promise<void> {
  try {
    await api.post("/auth/logout");
  } catch (error) {
    console.warn("[logout] ログアウトAPI失敗:", error);
  } finally {
    localStorage.removeItem(AUTH_FLAG_KEY);
    dispatchAuthChange();
    // 진행 중 요청만 취소 — cancel 은 재요청을 트리거하지 않으므로 401 을 유발하지 않는다.
    void queryClient.cancelQueries();
  }
}
