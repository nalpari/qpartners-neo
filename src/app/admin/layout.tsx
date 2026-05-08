import { redirect } from "next/navigation";

import { AdminTab } from "@/components/layout/admin-tab";
import { getFallbackRole } from "@/lib/auth";
import { ADMIN_MENU } from "@/lib/menu-codes";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

/**
 * RBAC — 관리자 영역 라우트 가드 (서버 컴포넌트).
 *
 * - 미인증(JWT 없음·만료) → `/login` redirect
 * - 2FA 미완료 → `/login` redirect (middleware 와 동일 fail-closed)
 * - roleCode 폴백 실패(미지의 userTp) → `/` redirect
 * - 매트릭스에서 ADM_* 7개 메뉴 중 `canRead=true` 가 하나도 없으면 → `/` redirect
 *
 * 정책 (2026-05-08): 종전 `isAdmin(role)` 하드코딩 분기 제거. 권한관리 매트릭스 단일 진실
 * 원천(SoT) 으로 수렴 — `qp_role_menu_permissions` 의 ADM_* 메뉴 read 보유 여부만으로 진입을
 * 판정한다. 운영자가 일반 권한군에 ADM_* read 를 부여하면 `/admin/**` 진입이 즉시 허용됨.
 *
 * ※ 서버 truth source 는 각 page.tsx 의 `requirePageMenuPermission` + 각 API route 의
 *   `requireMenuPermission` 이 담당. 본 layout 은 1차 진입 차단 용도.
 * ※ `getSessionUser` 는 React `cache()` 기반이므로 하위 page 에서 동일 요청 내 재호출해도
 *   JWT 서명 검증(jose) 은 단 1회만 실행.
 * ※ `ConfigError` (JWT_SECRET 미설정) 는 상위 error boundary 로 전파해 500 페이지로 수렴.
 */

const ADMIN_MENU_CODES = Object.values(ADMIN_MENU);

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

  const roleCode = user.authRole ?? getFallbackRole(user.userTp);
  if (!roleCode) {
    redirect("/");
  }

  // 매트릭스 단일화 — ADM_* 메뉴 중 하나라도 read 권한이 있으면 진입 허용.
  // role.isActive=true 강제(비활성 권한 회원 차단), menu.isActive=true 강제(비활성 메뉴 무시).
  // 페이지별 세부 가드는 각 page.tsx 의 `requirePageMenuPermission` 이 담당.
  const adminPerm = await prisma.qpRoleMenuPermission.findFirst({
    where: {
      roleCode,
      menuCode: { in: ADMIN_MENU_CODES },
      canRead: true,
      menu: { isActive: true },
      role: { isActive: true },
    },
    select: { roleCode: true },
  });
  if (!adminPerm) {
    console.warn(
      `[AdminLayout] ADM_* read 권한 없음 — / redirect (roleCode=${roleCode})`,
    );
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
