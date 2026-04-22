import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin, requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restrictedMenuCodeSet } from "@/lib/schemas/common";
import {
  roleCodeParamSchema,
  updatePermissionsSchema,
} from "@/lib/schemas/permission";

type Params = { params: Promise<{ roleCode: string }> };

/**
 * PII 보호 — byUserId 는 ADMIN 계열에서 이메일/로그인 ID 인 경우가 많아 평문 로깅 금지
 * (`.claude/rules/api.md`). 관리자 풀이 작아 prefix 4자만으로도 재식별 위험이 크므로
 * 8자 미만은 전체 마스킹, 8자 이상은 앞 2자만 노출 (운영 추적 최소치 확보).
 */
function maskUserId(id: string): string {
  if (id.length < 8) return "***";
  return `${id.slice(0, 2)}***`;
}

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

/**
 * PUT /api/roles/:roleCode/permissions — 메뉴별 권한 일괄 저장.
 *
 * 권한: SUPER_ADMIN 전용 (requireSuperAdmin). ADMIN 은 조회만 가능.
 *   · 과거 requireAdmin 허용 시 ADMIN 이 1ST_STORE/SEKO 등 하위 역할의 매트릭스를 임의 조작하여
 *     MEMBERS.canDelete / BULK_MAIL.canCreate 등을 부여할 수 있었음 (CRITICAL #1).
 *
 * 저장 전략: upsert (replace 아님).
 *   · 과거 `deleteMany + create` 는 payload 에 PERMISSIONS 행이 누락되면 PERMISSIONS 행까지
 *     일괄 삭제되어 lockout 가드를 우회할 수 있었음 (CRITICAL #2).
 *   · upsert 는 payload 에 포함된 menuCode 만 갱신, 나머지는 기존 값 유지 → 우회 경로 차단 +
 *     `created_at` / `created_by` 감사 추적 보존 (HIGH #7).
 *
 * Lockout 가드 3단:
 *   1. target === "SUPER_ADMIN" — payload 에 `PERMISSIONS.canUpdate === false` 가 있으면 거부.
 *      SUPER_ADMIN 이 자신의 권한관리 update 권한을 내리면 시스템 전체 lockout (CRITICAL #4).
 *   2. target === "SUPER_ADMIN" — payload 에 RESTRICTED 메뉴(PERMISSIONS/MENUS/CODES) 의
 *      `canRead === false` 가 있으면 거부. read 가 막히면 해당 관리 페이지 자체가 열리지 않아
 *      복구가 DB 직접 수정 없이 불가능해진다 (CRITICAL #5).
 *   3. target !== "SUPER_ADMIN" — payload 에 `ADMIN_RESTRICTED_MENUS`(PERMISSIONS/MENUS/CODES)
 *      중 CUD true 가 있으면 거부. 매트릭스 의도(ADMIN = read only, 비관리자 = 접근 없음)
 *      를 API 단에서 강제 (HIGH #6).
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = requireSuperAdmin(request.headers);
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

    // Lockout 가드 #1 — SUPER_ADMIN self-demotion 차단 (PERMISSIONS.canUpdate).
    if (parsedCode.data === "SUPER_ADMIN") {
      const permRow = result.data.permissions.find(
        (p) => p.menuCode === "PERMISSIONS",
      );
      if (permRow && permRow.canUpdate === false) {
        console.warn(
          "[PUT /api/roles/:roleCode/permissions] SUPER_ADMIN self-lockout 시도 차단",
          {
            byUserType: auth.user.userType,
            byUserIdMasked: maskUserId(auth.user.userId),
            byRole: auth.user.role,
          },
        );
        return NextResponse.json(
          {
            error: "スーパー管理者の「権限管理」更新権限は無効化できません",
            menuCode: "PERMISSIONS",
            action: "update",
          },
          { status: 400 },
        );
      }

      // Lockout 가드 #2 — SUPER_ADMIN 이 RESTRICTED 메뉴의 canRead 를 회수하면
      //                  해당 관리 페이지 자체가 열리지 않아 복구 불가.
      const readRevocation = result.data.permissions.find(
        (p) => restrictedMenuCodeSet.has(p.menuCode) && p.canRead === false,
      );
      if (readRevocation) {
        console.warn(
          "[PUT /api/roles/:roleCode/permissions] SUPER_ADMIN RESTRICTED canRead 회수 시도 차단",
          {
            targetRoleCode: parsedCode.data,
            menuCode: readRevocation.menuCode,
            byUserType: auth.user.userType,
            byUserIdMasked: maskUserId(auth.user.userId),
            byRole: auth.user.role,
          },
        );
        return NextResponse.json(
          {
            error: `スーパー管理者の「${readRevocation.menuCode}」閲覧権限は無効化できません`,
            menuCode: readRevocation.menuCode,
            action: "read",
          },
          { status: 400 },
        );
      }
    }

    // Lockout 가드 #3 — 비 SUPER_ADMIN 역할에 RESTRICTED 메뉴 CUD 부여 차단.
    if (parsedCode.data !== "SUPER_ADMIN") {
      const violation = result.data.permissions.find(
        (p) =>
          restrictedMenuCodeSet.has(p.menuCode) &&
          (p.canCreate || p.canUpdate || p.canDelete),
      );
      if (violation) {
        const action = violation.canCreate
          ? "create"
          : violation.canUpdate
            ? "update"
            : "delete";
        console.warn(
          "[PUT /api/roles/:roleCode/permissions] RESTRICTED 메뉴 권한 상승 시도 차단",
          {
            targetRoleCode: parsedCode.data,
            violatedMenuCode: violation.menuCode,
            violatedAction: action,
            byUserType: auth.user.userType,
            byUserIdMasked: maskUserId(auth.user.userId),
            byRole: auth.user.role,
          },
        );
        return NextResponse.json(
          {
            error: `「${violation.menuCode}」の${action}権限はスーパー管理者にのみ付与できます`,
            menuCode: violation.menuCode,
            action,
          },
          { status: 400 },
        );
      }
    }

    // upsert — payload 에 포함된 행만 갱신, 나머지는 기존 값 유지.
    // 트랜잭션으로 묶어 부분 실패 시 전체 롤백.
    const updatedBy = auth.user.userId;
    await prisma.$transaction(
      result.data.permissions.map((perm) =>
        prisma.qpRoleMenuPermission.upsert({
          where: {
            roleCode_menuCode: {
              roleCode: parsedCode.data,
              menuCode: perm.menuCode,
            },
          },
          update: {
            canRead: perm.canRead,
            canCreate: perm.canCreate,
            canUpdate: perm.canUpdate,
            canDelete: perm.canDelete,
            updatedBy,
          },
          create: {
            roleCode: parsedCode.data,
            menuCode: perm.menuCode,
            canRead: perm.canRead,
            canCreate: perm.canCreate,
            canUpdate: perm.canUpdate,
            canDelete: perm.canDelete,
            createdBy: updatedBy,
            updatedBy,
          },
        }),
      ),
    );

    return NextResponse.json({
      data: {
        roleCode: parsedCode.data,
        updated: result.data.permissions.length,
      },
    });
  } catch (error) {
    console.error("[PUT /api/roles/:roleCode/permissions]", error);
    return NextResponse.json(
      { error: "権限の更新に失敗しました" },
      { status: 500 },
    );
  }
}
