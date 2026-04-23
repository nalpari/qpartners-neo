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

export async function requirePageMenuPermission(
  menuCode: MenuCode,
  action: MenuAction,
  options: Options = {},
): Promise<void> {
  const { fallback = "/" } = options;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    redirect("/login");
  }

  const roleCode = user.authRole;
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
