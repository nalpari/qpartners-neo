// 서버 컴포넌트용 RBAC 가드 헬퍼 — 페이지 진입 단계에서 매트릭스 기반 권한 확인.
//
// 각 page.tsx 서버 컴포넌트에서 호출:
//   ```tsx
//   export default async function Page() {
//     await requirePageMenuPermission("CONTENT", "read");
//     return <ClientComponent />;
//   }
//   ```
//
// 미인증 → /login redirect (단, `allowAnonymous: true` 이면 비회원 허용)
// 2FA 미완료 → /login redirect (세션 재확립 유도, middleware 와 동일 규약)
// 권한 없음 → fallback 경로 redirect (기본 "/")
// 정상 → void 반환

import { redirect } from "next/navigation";

import { getFallbackRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { MenuAction, MenuCode } from "@/lib/schemas/common";
import { getSessionUser } from "@/lib/session";

const ACTION_TO_COLUMN: Record<MenuAction, "canRead" | "canCreate" | "canUpdate" | "canDelete"> = {
  read: "canRead",
  create: "canCreate",
  update: "canUpdate",
  delete: "canDelete",
};

interface Options {
  /** 권한 없을 때 이동할 경로 (기본 "/") */
  fallback?: string;
  /**
   * 비회원(JWT 없음/만료) 접근 허용 여부 (기본 false).
   * true 로 설정하면 비회원은 그대로 통과, 로그인 사용자만 매트릭스 가드 적용.
   * 예: `/contents`, `/inquiry` 처럼 API GET 이 PUBLIC 경로(middleware `PUBLIC_GET_PATTERNS`)로
   *    열려 있어 페이지-API 대칭을 유지해야 하는 경우 사용한다.
   */
  allowAnonymous?: boolean;
}

/**
 * 페이지 서버 가드 — middleware 와 동일한 JWT 정책으로 검증한다.
 *
 * - ConfigError (JWT_SECRET 미설정): `getSessionUser` 가 상위 error boundary 로 재전파
 *   (dev 전용 사태이며 운영에서는 500 페이지로 수렴).
 * - 토큰 없음 / 서명 불일치 / 만료 → `/login` (또는 `allowAnonymous` 이면 통과)
 * - 2FA 필요한데 미완료(`twoFactorVerified === false`) → `/login` (middleware 와 동일 fail-closed).
 * - `authRole` 미탑재 과도기 JWT → `getFallbackRole(userTp)` 로 폴백 (middleware 와 동일 규칙).
 * - 폴백도 실패(미지의 userTp)하거나 매트릭스상 권한 없음 → `fallback` 경로로 redirect.
 *
 * 세션 조회는 `getSessionUser` (React `cache()`) 를 경유 — 같은 요청 내
 * admin layout 등에서 중복 호출해도 JWT 서명 검증은 1회만 실행된다.
 */
export async function requirePageMenuPermission(
  menuCode: MenuCode,
  action: MenuAction,
  options: Options = {},
): Promise<void> {
  const { fallback = "/", allowAnonymous = false } = options;

  const user = await getSessionUser();

  if (!user) {
    if (allowAnonymous) return;
    console.warn(
      `[requirePageMenuPermission] 미인증 — /login redirect (menuCode=${menuCode}, action=${action})`,
    );
    redirect("/login");
  }

  // 2FA 필요하나 미완료 — API 는 middleware 에서 차단되나 페이지는 직접 진입 가능했던 갭 방어.
  // false 인 경우만 거부 (true/undefined 는 2FA 불필요 또는 검증 완료로 간주).
  if (user.twoFactorVerified === false) {
    console.warn(
      `[requirePageMenuPermission] 2FA 미완료 — /login redirect (menuCode=${menuCode}, action=${action})`,
    );
    redirect("/login");
  }

  const roleCode = user.authRole ?? getFallbackRole(user.userTp);
  if (!roleCode) {
    console.warn(
      `[requirePageMenuPermission] roleCode 폴백 실패 — fallback redirect (userTp=${user.userTp}, menuCode=${menuCode})`,
    );
    redirect(fallback);
  }

  const perm = await prisma.qpRoleMenuPermission.findFirst({
    where: { roleCode, menuCode, menu: { isActive: true } },
    select: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
  });

  const column = ACTION_TO_COLUMN[action];
  if (!perm?.[column]) {
    console.warn(
      `[requirePageMenuPermission] 권한 거부 — role=${roleCode}, menuCode=${menuCode}, action=${action}`,
    );
    redirect(fallback);
  }
}
