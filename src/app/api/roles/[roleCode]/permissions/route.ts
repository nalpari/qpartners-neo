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
        { error: "Invalid roleCode" },
        { status: 400 },
      );
    }

    // Role 존재 확인
    const role = await prisma.qpRole.findUnique({
      where: { roleCode: parsedCode.data },
      select: { roleCode: true, roleName: true },
    });

    if (!role) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 전체 메뉴(1-Level + children) + 해당 roleCode의 권한 매핑 (nested include로 1-query)
    // M-1: 비활성화된 메뉴는 권한 팝업에 노출되지 않도록 parent/children 모두 isActive 필터 적용
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
      { error: "Failed to fetch permissions" },
      { status: 500 },
    );
  }
}

// PUT /api/roles/:roleCode/permissions — 메뉴별 권한 일괄 저장
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { roleCode } = await params;
    const parsedCode = roleCodeParamSchema.safeParse(roleCode);
    if (!parsedCode.success) {
      return NextResponse.json(
        { error: "Invalid roleCode" },
        { status: 400 },
      );
    }

    // Role 존재 확인
    const role = await prisma.qpRole.findUnique({
      where: { roleCode: parsedCode.data },
      select: { roleCode: true },
    });

    if (!role) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = updatePermissionsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // Lockout 방지: PERMISSIONS.canUpdate 는 SUPER_ADMIN 전용 고정.
    // 비 SUPER_ADMIN role 에 canUpdate:true 로 세팅하려는 시도를 차단한다.
    // 시드에서도 이중화되어 있으나, 런타임에 타 관리자가 API 로 우회하는 경로를 막기 위함.
    if (parsedCode.data !== "SUPER_ADMIN") {
      const elevating = result.data.permissions.some(
        (p) => p.menuCode === "PERMISSIONS" && p.canUpdate === true,
      );
      if (elevating) {
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

    // 기존 권한 전부 삭제 후 새로 생성 (replace) — 트랜잭션
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
      { error: "Failed to update permissions" },
      { status: 500 },
    );
  }
}
