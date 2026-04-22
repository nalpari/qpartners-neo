import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  roleCodeParamSchema,
  updatePermissionsSchema,
} from "@/lib/schemas/permission";

type Params = { params: Promise<{ roleCode: string }> };

// GET /api/roles/:roleCode/permissions — 메뉴별 권한 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { roleCode } = await params;
    const parsedCode = roleCodeParamSchema.safeParse(roleCode);
    if (!parsedCode.success) {
      return NextResponse.json(
        { error: "無効な権限コードです" },
        { status: 400 },
      );
    }

    const role = await prisma.qpRole.findUnique({
      where: { roleCode: parsedCode.data },
      select: { roleCode: true, roleName: true },
    });

    if (!role) {
      return NextResponse.json(
        { error: "指定された権限が見つかりません" },
        { status: 404 },
      );
    }

    // nested include 로 parent + children + permissions 를 1-query 로 조회.
    // 비활성화된 메뉴는 권한 팝업에 노출되지 않도록 parent/children 양쪽에 isActive 필터 적용.
    const menus = await prisma.menu.findMany({
      where: { parentId: null, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            permissions: { where: { roleCode: parsedCode.data } },
          },
        },
        permissions: {
          where: { roleCode: parsedCode.data },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const menuData = menus.map((menu) => {
      const perm = menu.permissions[0];
      return {
        menuCode: menu.menuCode,
        menuName: menu.menuName,
        level: 1,
        hasUrl: menu.pageUrl !== null,
        canRead: perm?.canRead ?? false,
        canCreate: perm?.canCreate ?? false,
        canUpdate: perm?.canUpdate ?? false,
        canDelete: perm?.canDelete ?? false,
        children: menu.children.map((child) => {
          const cPerm = child.permissions[0];
          return {
            menuCode: child.menuCode,
            menuName: child.menuName,
            level: 2,
            hasUrl: child.pageUrl !== null,
            canRead: cPerm?.canRead ?? false,
            canCreate: cPerm?.canCreate ?? false,
            canUpdate: cPerm?.canUpdate ?? false,
            canDelete: cPerm?.canDelete ?? false,
          };
        }),
      };
    });

    return NextResponse.json({
      data: {
        roleCode: role.roleCode,
        roleName: role.roleName,
        menus: menuData,
      },
    });
  } catch (error) {
    console.error("[GET /api/roles/:roleCode/permissions]", error);
    return NextResponse.json(
      { error: "権限の取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { roleCode } = await params;
    const parsedCode = roleCodeParamSchema.safeParse(roleCode);
    if (!parsedCode.success) {
      return NextResponse.json(
        { error: "無効な権限コードです" },
        { status: 400 },
      );
    }

    const role = await prisma.qpRole.findUnique({
      where: { roleCode: parsedCode.data },
      select: { roleCode: true },
    });

    if (!role) {
      return NextResponse.json(
        { error: "指定された権限が見つかりません" },
        { status: 404 },
      );
    }

    // Lockout 방지 (SUPER_ADMIN target 가드) —
    // 타 관리자가 PUT /roles/SUPER_ADMIN/permissions 로 SUPER_ADMIN 권한을 뒤집어
    // 자신을 포함 아무도 권한관리를 못 하게 만드는 우회 경로를 차단한다.
    if (parsedCode.data === "SUPER_ADMIN" && auth.user.role !== "SUPER_ADMIN") {
      console.warn(
        "[PUT /api/roles/:roleCode/permissions] SUPER_ADMIN 권한 변경 시도 차단",
        {
          byUserType: auth.user.userType,
          byUserId: auth.user.userId,
          byRole: auth.user.role,
        },
      );
      return NextResponse.json(
        {
          error: "スーパー管理者の権限はスーパー管理者のみ変更できます",
          menuCode: "PERMISSIONS",
          action: "update",
        },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn(
        "[PUT /api/roles/:roleCode/permissions] Request body 파싱 실패:",
        { roleCode: parsedCode.data, error },
      );
      return NextResponse.json(
        { error: "無効なJSON本文です" },
        { status: 400 },
      );
    }

    const result = updatePermissionsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "バリデーションエラー", issues: result.error.issues },
        { status: 400 },
      );
    }

    // Lockout 방지 (PERMISSIONS.canUpdate 상승 가드) —
    // 비 SUPER_ADMIN role 에 canUpdate:true 로 세팅하려는 시도를 차단.
    // 초기 seed 기준으로도 동일한 제약이 적용되지만 API 경로의 런타임 보증이 우선이다.
    if (parsedCode.data !== "SUPER_ADMIN") {
      const elevating = result.data.permissions.some(
        (p) => p.menuCode === "PERMISSIONS" && p.canUpdate === true,
      );
      if (elevating) {
        console.warn(
          "[PUT /api/roles/:roleCode/permissions] 권한 상승 시도 차단",
          {
            targetRoleCode: parsedCode.data,
            byUserType: auth.user.userType,
            byUserId: auth.user.userId,
            byRole: auth.user.role,
          },
        );
        return NextResponse.json(
          {
            error: "「権限管理」の更新権限はスーパー管理者にのみ付与できます",
            menuCode: "PERMISSIONS",
            action: "update",
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction([
      prisma.qpRoleMenuPermission.deleteMany({
        where: { roleCode: parsedCode.data },
      }),
      ...result.data.permissions.map((perm) =>
        prisma.qpRoleMenuPermission.create({
          data: {
            roleCode: parsedCode.data,
            menuCode: perm.menuCode,
            canRead: perm.canRead,
            canCreate: perm.canCreate,
            canUpdate: perm.canUpdate,
            canDelete: perm.canDelete,
          },
        }),
      ),
    ]);

    return NextResponse.json({
      data: { roleCode: parsedCode.data, updated: result.data.permissions.length },
    });
  } catch (error) {
    console.error("[PUT /api/roles/:roleCode/permissions]", error);
    return NextResponse.json(
      { error: "権限の更新に失敗しました" },
      { status: 500 },
    );
  }
}
