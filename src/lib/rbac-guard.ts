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
// 미인증 → /login redirect
// 권한 없음 → fallback 경로 redirect (기본 "/")
// 정상 → void 반환 (필요 시 인자에 fallback 변경)

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getFallbackRole } from "@/lib/auth";
import { ConfigError } from "@/lib/errors";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import type { MenuAction, MenuCode } from "@/lib/schemas/common";

const ACTION_TO_COLUMN: Record<MenuAction, "canRead" | "canCreate" | "canUpdate" | "canDelete"> = {
  read: "canRead",
  create: "canCreate",
  update: "canUpdate",
  delete: "canDelete",
};

interface Options {
  /** 권한 없을 때 이동할 경로 (기본 "/") */
  fallback?: string;
}

/**
 * 페이지 서버 가드 — middleware 와 동일한 JWT 정책으로 검증한다.
 *
 * - ConfigError (JWT_SECRET 미설정): middleware 와 동일하게 상위 Next.js error boundary 에 전파
 *   (dev 전용 사태이며 운영에서는 500 페이지로 수렴하는 게 원하는 동작).
 * - 토큰 없음 / 서명 불일치 / 만료 → `/login`
 * - `authRole` 미탑재 과도기 JWT → `getFallbackRole(userTp)` 로 폴백 (middleware 와 동일 규칙).
 * - 폴백도 실패(미지의 userTp)하거나 매트릭스상 권한 없음 → `fallback` 경로로 redirect.
 */
export async function requirePageMenuPermission(
  menuCode: MenuCode,
  action: MenuAction,
  options: Options = {},
): Promise<void> {
  const { fallback = "/" } = options;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  let user: Awaited<ReturnType<typeof verifyToken>> = null;
  if (token) {
    try {
      user = await verifyToken(token);
    } catch (error) {
      if (error instanceof ConfigError) {
        // 설정 에러는 middleware 규약상 5xx 로 수렴시켜야 함. 상위로 재전파.
        throw error;
      }
      // 서명 불일치·만료 등은 미인증으로 처리 (로그는 middleware 레벨에서 담당).
      user = null;
    }
  }

  if (!user) {
    redirect("/login");
  }

  const roleCode = user.authRole ?? getFallbackRole(user.userTp);
  if (!roleCode) {
    redirect(fallback);
  }

  const perm = await prisma.qpRoleMenuPermission.findFirst({
    where: { roleCode, menuCode, menu: { isActive: true } },
    select: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
  });

  const column = ACTION_TO_COLUMN[action];
  if (!perm?.[column]) {
    redirect(fallback);
  }
}
