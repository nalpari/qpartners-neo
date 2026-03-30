import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  roleCodeParamSchema,
  updatePermissionsSchema,
} from "@/lib/schemas/permission";

type Params = { params: Promise<{ roleCode: string }> };

// GET /api/roles/:roleCode/permissions — 메뉴별 권한 조회
export async function GET(_request: NextRequest, { params }: Params) {
  try {
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

    // 전체 메뉴(1-Level + children) + 해당 roleCode의 권한 매핑
    const menus = await prisma.menu.findMany({
      where: { parentId: null },
      include: {
        children: { orderBy: { sortOrder: "asc" } },
        permissions: {
          where: { roleCode: parsedCode.data },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    // children에도 permissions를 로드하기 위해 별도 쿼리
    const childMenuCodes = menus.flatMap((m) =>
      m.children.map((c) => c.menuCode),
    );

    const childPermissions = await prisma.qpRoleMenuPermission.findMany({
      where: {
        roleCode: parsedCode.data,
        menuCode: { in: childMenuCodes },
      },
    });

    const childPermMap = new Map(
      childPermissions.map((p) => [p.menuCode, p]),
    );

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
          const cPerm = childPermMap.get(child.menuCode);
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
