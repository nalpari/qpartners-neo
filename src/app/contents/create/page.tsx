import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ContentsForm } from "@/components/contents/create/contents-form";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

/**
 * RBAC — 콘텐츠 신규 등록 페이지 서버 가드.
 *
 * - 미인증 → `/login`
 * - CONTENT.canCreate 매트릭스 false → `/contents` 목록으로 redirect (페이지 직진입 차단)
 *
 * ※ 서버 최종 방어선은 `POST /api/contents` 의 `requireMenuPermission(CONTENT, "create")`.
 *   본 페이지 가드는 URL 직진입 UX 차원의 선제 차단.
 */
export default async function ContentsCreatePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    redirect("/login");
  }
  const roleCode = user.authRole;
  if (!roleCode) {
    redirect("/contents");
  }

  const perm = await prisma.qpRoleMenuPermission.findFirst({
    where: { roleCode, menuCode: "CONTENT", menu: { isActive: true } },
    select: { canCreate: true },
  });
  if (!perm?.canCreate) {
    redirect("/contents");
  }

  return <ContentsForm mode="create" />;
}
