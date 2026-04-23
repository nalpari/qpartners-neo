import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders } from "@/lib/auth";
import type { MenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { menuCodeSchema } from "@/lib/schemas/common";

/**
 * GET /api/auth/me/permissions — 현재 로그인 사용자의 메뉴별 권한 목록
 *
 * - 인증 필요 (미인증 → 401). middleware 에서 JWT 검증 후 X-User-* 헤더 주입됨.
 * - `authRole` ↔ `roleCode` 1:1 매핑 — X-User-Role 을 roleCode 로 그대로 사용.
 * - `SUPER_ADMIN`: 활성 메뉴 전체 CRUD true 합성 반환 (fail-open, resolveMenuPermission 정책 동일).
 * - 그 외: 단일 `findMany` 배치 쿼리로 해당 roleCode 의 활성 메뉴 권한 조회 (fail-closed).
 *   · resolveMenuPermission(단건 가드)과 동일 매핑 로직이나 쿼리 패턴만 배치 최적화.
 * - 시드 외 menuCode 가 DB 에 존재하면 응답에서 제외 (MenuCode 리터럴 유니온 검증 실패 시).
 * - 응답 캐싱: `private, no-store` — 권한 회수 즉시성 확보.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const roleCode = user.role;

    let menus: Array<{ menuCode: string } & MenuPermission>;

    if (roleCode === "SUPER_ADMIN") {
      // SUPER_ADMIN: 활성 메뉴 전체 CRUD true 합성 (DB 권한 조회 스킵)
      const activeMenus = await prisma.menu.findMany({
        where: { isActive: true },
        select: { menuCode: true },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      });
      menus = activeMenus.flatMap((m) => {
        const parsed = menuCodeSchema.safeParse(m.menuCode);
        if (!parsed.success) {
          console.warn(
            `[GET /api/auth/me/permissions] 시드 외 menuCode 응답 제외: ${m.menuCode}`,
          );
          return [];
        }
        return [{ menuCode: parsed.data, canRead: true, canCreate: true, canUpdate: true, canDelete: true }];
      });
    } else {
      // 배치 쿼리 1회로 해당 roleCode 의 활성 메뉴 권한 전체 조회
      const permissions = await prisma.qpRoleMenuPermission.findMany({
        where: { roleCode, menu: { isActive: true } },
        select: {
          menuCode: true,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
        orderBy: [
          { menu: { parentId: "asc" } },
          { menu: { sortOrder: "asc" } },
        ],
      });
      menus = permissions.flatMap((p) => {
        const parsed = menuCodeSchema.safeParse(p.menuCode);
        if (!parsed.success) {
          console.warn(
            `[GET /api/auth/me/permissions] 시드 외 menuCode 응답 제외: ${p.menuCode}`,
          );
          return [];
        }
        return [{
          menuCode: parsed.data,
          canRead: p.canRead,
          canCreate: p.canCreate,
          canUpdate: p.canUpdate,
          canDelete: p.canDelete,
        }];
      });
    }

    const response = NextResponse.json({
      data: { roleCode, menus },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[GET /api/auth/me/permissions]", error);
    return NextResponse.json(
      { error: "権限の取得に失敗しました" },
      { status: 500 },
    );
  }
}
