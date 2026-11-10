import api from "@/lib/axios";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import { resetListRestoreState } from "@/hooks/use-list-state-persist";
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
 * 콘텐츠(자료) 전용 클라이언트 수정/삭제 권한 — 서버 `canModifyContent` 와 동기화 (Redmine #2779)
 * - SUPER_ADMIN: 모든 글
 * - 그 외(ADMIN 포함): 본인 작성글만
 *
 * 공용 {@link canModifyClient} 와 분리한 이유는 서버 쪽과 동일 — #2779 의 요구 범위가
 * 콘텐츠 화면 한정이라, 홈공지·대량메일이 쓰는 판정은 건드리지 않는다.
 *
 * authRole 미설정 과도기 폴백: ADMIN 도 본인 매칭으로 수렴하므로 role 판정은 SUPER_ADMIN 여부만 본다.
 *
 * ⚠️ 서버 `canModifyContent` 는 `{ userType, userId }` 를 동시 비교하지만 여기서는 `userId` 만
 * 비교한다(콘텐츠 상세 응답에 작성자 `userType` 이 없다). 타입 간 userId 중복 시 버튼이 보이고
 * 저장에서 403 이 될 수 있으나, 서버가 엄격한 쪽이므로 권한 우회는 아니다.
 */
export function canModifyContentClient(
  user: LoginUser | null | undefined,
  resource: { userId: string },
): boolean {
  if (!user) return false;
  const role = user.authRole ?? (user.userTp === "ADMIN" ? "ADMIN" : null);
  if (role === "SUPER_ADMIN") return true;
  return user.userId === resource.userId;
}

/**
 * 클라이언트 사이드 로그아웃 처리
 * - /api/auth/logout 호출 (실패해도 로컬 상태 정리)
 * - AUTH_FLAG_KEY 제거 + 이벤트 발행
 * - TanStack Query 캐시 전체 클리어
 * - 목록 복원 상태(sessionStorage + history 마커) 폐기 — 로그아웃은 SPA 전환이라 문서가
 *   유지되므로, 정리하지 않으면 같은 탭의 다음 사용자가 뒤로가기했을 때 이전 사용자의
 *   검색조건이 복원된다.
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
    resetListRestoreState();
  }
}
