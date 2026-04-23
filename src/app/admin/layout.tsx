import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminTab } from "@/components/layout/admin-tab";
import { isAdmin } from "@/lib/auth";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";

/**
 * RBAC Phase 3 — 관리자 영역 라우트 가드 (서버 컴포넌트).
 *
 * - 미인증(JWT 없음·만료) → `/login` redirect
 * - 인증되었으나 ADMIN/SUPER_ADMIN 이 아님 → `/` redirect
 * - middleware matcher 는 `/api/:path*` 만 커버하므로, `/admin/**` 페이지 직진입을 여기서 1차 차단
 *
 * ※ 서버 truth source 는 각 route handler 의 `requireAdmin` 이 담당.
 *   본 layout 은 UI 레벨 선제 차단 용도 — 클라이언트 bypass 되어도 API 가 403 으로 재검증.
 * ※ authRole 이 optional 인 JWT(Grace period) 에서는 `isAdmin("")` 이 false 를 반환 —
 *   fail-closed 원칙으로 미인가 취급.
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    redirect("/login");
  }
  if (!isAdmin(user.authRole ?? "")) {
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
