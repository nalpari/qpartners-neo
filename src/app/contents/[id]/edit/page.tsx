import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ContentsForm } from "@/components/contents/create/contents-form";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ id: string }>;

/**
 * RBAC — 콘텐츠 수정 페이지 서버 가드.
 *
 * - 미인증 → `/login`
 * - CONTENT.canUpdate 매트릭스 false → `/contents/:id` 상세로 redirect (직진입 차단)
 *
 * ※ 서버 최종 방어선은 `PUT /api/contents/:id` 의 `requireMenuPermission(CONTENT, "update")`.
 *   작성자 가드(canModifyResource) 는 API 내부에서 별도 검증.
 */
export default async function ContentsEditPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    redirect("/login");
  }
  const roleCode = user.authRole;
  if (!roleCode) {
    redirect(`/contents/${id}`);
  }

  const perm = await prisma.qpRoleMenuPermission.findFirst({
    where: { roleCode, menuCode: "CONTENT", menu: { isActive: true } },
    select: { canUpdate: true },
  });
  if (!perm?.canUpdate) {
    redirect(`/contents/${id}`);
  }

  return <ContentsForm mode="edit" contentId={id} />;
}
