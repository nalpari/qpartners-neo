import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/me/permissions — 현재 로그인 사용자의 메뉴별 권한 목록
 *
 * - 인증 필요 (미인증 → 401). middleware 에서 JWT 검증 후 X-User-* 헤더 주입됨.
 * - `authRole` ↔ `roleCode` 1:1 매핑 (메모리 §4) — X-User-Role 을 roleCode 로 그대로 사용.
 * - `SUPER_ADMIN`: QpRoleMenuPermission 조회 스킵, 활성 메뉴 전체 CRUD true 로 합성 반환 (fail-open).
 * - 그 외: 활성 메뉴에 한해 조회. 시드에 미등록인 메뉴는 응답에서 제외 (fail-closed).
 * - 응답 캐싱: `private, no-store` — 권한 회수 즉시성 확보 (SUPER_ADMIN 이 PUT /roles/../permissions 로
 *   권한을 회수해도 브라우저/중간 캐시가 옛 응답을 보관하면 UI 에는 보이는데 서버는 403 하는 UX 가 발생.
 *   권한 1회 조회 비용은 인덱스 포함 JOIN 1건(수 ms)으로 무시 가능).
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const roleCode = user.role;

    let menus: Array<{
      menuCode: string;
      canRead: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>;

    if (roleCode === "SUPER_ADMIN") {
      const activeMenus = await prisma.menu.findMany({
        where: { isActive: true },
        select: { menuCode: true },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      });
      menus = activeMenus.map((m) => ({
        menuCode: m.menuCode,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }));
    } else {
      const permissions = await prisma.qpRoleMenuPermission.findMany({
        where: { roleCode, menu: { isActive: true } },
        select: {
          menuCode: true,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          menu: { select: { parentId: true, sortOrder: true } },
        },
        orderBy: [
          { menu: { parentId: "asc" } },
          { menu: { sortOrder: "asc" } },
        ],
      });
      menus = permissions.map((p) => ({
        menuCode: p.menuCode,
        canRead: p.canRead,
        canCreate: p.canCreate,
        canUpdate: p.canUpdate,
        canDelete: p.canDelete,
      }));
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
