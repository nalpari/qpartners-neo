"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_FLAG_KEY, AUTH_EXPIRED_EVENT } from "@/components/login/types";

/**
 * 세션 없이 접근 가능한 "공개" 라우트 화이트리스트.
 *
 * fail-closed 설계: 여기 없으면 보호 라우트로 간주한다. 신규 라우트(특히 관리자)를 추가할 때
 * 보호 목록에 넣는 걸 잊어도 기본이 "보호"라 PII 노출이 아니라 불필요한 /login 이동(불편)으로만 귀결된다.
 *
 * 유지보수: 새 공개 페이지가 생기면 여기 한 곳만 갱신한다.
 */
const PUBLIC_EXACT = new Set(["/", "/login", "/password-reset", "/inquiry", "/contents"]);

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (PUBLIC_EXACT.has(pathname)) return true;
  // 콘텐츠 "상세 조회"만 공개(/contents/123). 작성(/contents/create)·수정(/contents/123/edit)은 보호.
  if (/^\/contents\/\d+$/.test(pathname)) return true;
  return false;
}

/**
 * 수동 세션 상실 시 보호 화면을 /login 으로 전환한다.
 *
 * 대상(수동 상실 = 이 탭에서 로그아웃 행위가 없었는데 세션이 무효가 된 경우):
 *   - 다른 탭 로그아웃 → `storage` 이벤트(AUTH_FLAG 제거). 원본 탭엔 안 오고 다른 탭에만 온다.
 *   - in-place 401 세션 만료 → axios 인터셉터의 `AUTH_EXPIRED_EVENT`.
 *
 * 능동 로그아웃(performLogout: 헤더/탈퇴/2FA 취소)은 호출부가 직접 이동을 책임지므로 여기서 반응하지
 * 않는다 — `AUTH_CHANGE_EVENT` 를 구독하지 않아 능동 흐름과 겹치거나 목적지가 충돌(예: 탈퇴→홈)하지 않는다.
 *
 * 공개 화면(홈 등)은 `useAuthFlag` 기반으로 게스트 뷰로 자연 degrade 되므로 이동시키지 않는다.
 * 보호 화면(관리자/마이페이지 등)만 이전 사용자 데이터가 잔존하므로 /login 으로 언마운트시킨다.
 * clear() 대신 라우팅으로 언마운트하는 이유는 마운트된 보호 쿼리의 재요청(→401)을 피하기 위함이다.
 */
export function AuthLossRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const redirectIfProtected = () => {
      if (!isPublicRoute(pathname)) {
        router.replace("/login");
      }
    };

    // 다른 탭 로그아웃 — AUTH_FLAG 가 "1" 이 아닌 값으로 바뀐 경우(제거)만 상실로 처리. 로그인("1")은 무시.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AUTH_FLAG_KEY && e.newValue !== "1") redirectIfProtected();
    };
    // in-place 401 세션 만료
    const handleExpired = () => redirectIfProtected();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    };
  }, [pathname, router]);

  return null;
}
