import { redirect } from "next/navigation";

import { AdminTab } from "@/components/layout/admin-tab";
import { getFallbackRole, isAdmin } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

/**
 * RBAC Phase 3 — 관리자 영역 라우트 가드 (서버 컴포넌트).
 *
 * - 미인증(JWT 없음·만료) → `/login` redirect
 * - 2FA 미완료 → `/login` redirect (middleware 와 동일 fail-closed. 페이지 직진입 방어 레이어)
 * - 인증되었으나 ADMIN/SUPER_ADMIN 이 아님 → `/` redirect
 * - middleware matcher 는 `/api/:path*` 만 커버하므로, `/admin/**` 페이지 직진입을 여기서 1차 차단
 *
 * ※ 서버 truth source 는 각 route handler 의 `requireAdmin`/`requireMenuPermission` 이 담당.
 *   본 layout 은 UI 레벨 선제 차단 용도 — 클라이언트 bypass 되어도 API 가 403 으로 재검증.
 * ※ `authRole` 없는 과도기 JWT 는 `getFallbackRole(userTp)` 로 복구 — middleware 와 동일 규칙.
 *   이 로직이 없으면 API 는 통과하지만 관리자 페이지 진입은 차단되는 비대칭 버그 발생.
 * ※ `getSessionUser` 는 React `cache()` 기반이므로 하위 page 의 `requirePageMenuPermission`
 *   이 동일 요청 내에 재호출해도 JWT 서명 검증(jose)은 단 1회만 실행된다.
 * ※ `ConfigError` (JWT_SECRET 미설정) 는 상위 error boundary 로 전파해 500 페이지로 수렴.
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  // 2FA 필요한데 미완료 — API middleware 규약과 맞춰 로그인 플로우로 재시작 유도
  if (user.twoFactorVerified === false) {
    redirect("/login");
  }

  const role = user.authRole ?? getFallbackRole(user.userTp);
  if (!role || !isAdmin(role)) {
    redirect("/");
  }

  return (
    <div className="flex flex-col items-center w-full">
      {/* 탭 네비게이션 */}
      <div className="flex flex-col items-center w-full bg-[#F7F9FB]">
        <AdminTab />
      </div>

      {/* 콘텐츠 영역 */}
      {children}
    </div>
  );
}
