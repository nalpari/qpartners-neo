import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin, requireMenuPermission } from "@/lib/auth";
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

/**
 * PUT /api/roles/:roleCode/permissions — 메뉴별 권한 일괄 저장.
 *
 * 권한: ADM_PERMISSION.canUpdate 매트릭스 가드.
 *
 * 저장 전략: upsert (replace 아님).
 *   · upsert 는 payload 에 포함된 menuCode 만 갱신, 나머지는 기존 값 유지.
 *   · `created_at` / `created_by` 감사 추적 보존.
 *
 * Lockout 가드 (SUPER_ADMIN 보호):
 *   · SUPER_ADMIN 대상 + ADM_PERMISSION.canUpdate=false → 400 (self-demotion 차단)
 *   · SUPER_ADMIN 대상 + ADM_PERMISSION/ADM_MENU/ADM_CODE canRead=false → 400 (관리 페이지 접근 불가 차단)
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "update");
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
      // 디버깅용 — 어떤 menuCode 가 형식 거부됐는지 서버 로그에 노출.
      // console.warn 의 기본 depth 제한으로 path/received 가 `[Array]` 로 truncate 되는 것을 피해 JSON 으로 직렬화.
      console.warn(
        "[PUT /api/roles/:roleCode/permissions] Zod 검증 실패\n"
          + JSON.stringify(
            {
              roleCode: parsedCode.data,
              issues: result.error.issues,
              receivedMenuCodes: Array.isArray((body as { permissions?: unknown })?.permissions)
                ? ((body as { permissions: Array<{ menuCode?: unknown }> }).permissions)
                    .map((p) => p?.menuCode)
                : undefined,
            },
            null,
            2,
          ),
      );
      // 첫 위반 메시지를 그대로 노출 — 사용자가 어떤 menuCode 의 어떤 규칙을 위반했는지 즉시 인지.
      // menuCodeFormatSchema 의 단계별 메시지(`英大文字で始めてください` 등) 가 그대로 전달됨 (Redmine #2164).
      // issues 는 message+path 만 노출 — `received`/`expected`/`code` 등 내부 스키마 구조 정보 차단.
      const firstMessage = result.error.issues[0]?.message ?? "バリデーションエラー";
      return NextResponse.json(
        {
          error: firstMessage,
          issues: result.error.issues.map((i) => ({ message: i.message, path: i.path })),
        },
        { status: 400 },
      );
    }

    // menuCode 존재성 검증 — schema 는 형식만 확인하므로 실제 DB `qp_menus` 에 존재하는지
    // 일괄 조회로 확정. 미존재 코드가 섞이면 upsert 단계에서 P2003(FK) 으로 떨어지는 대신
    // 어떤 코드가 유효하지 않은지 400 으로 친절히 반환. isActive 관계없이 존재만 확인한다
    // (비활성 메뉴도 매트릭스 기록은 유지해야 관리자 UI 재활성 시 권한이 복원되기 때문).
    const requestedCodes = result.data.permissions.map((p) => p.menuCode);
    const existingMenus = await prisma.menu.findMany({
      where: { menuCode: { in: requestedCodes } },
      select: { menuCode: true },
    });
    const existingSet = new Set(existingMenus.map((m) => m.menuCode));
    const unknownCodes = requestedCodes.filter((c) => !existingSet.has(c));
    if (unknownCodes.length > 0) {
      console.warn(
        "[PUT /api/roles/:roleCode/permissions] 미존재 menuCode 포함",
        { roleCode: parsedCode.data, unknownCodes },
      );
      return NextResponse.json(
        { error: "存在しないメニューコードが含まれています", unknownMenuCodes: unknownCodes },
        { status: 400 },
      );
    }

    // Lockout 가드 — SUPER_ADMIN self-demotion 차단.
    // ADM_PERMISSION.canUpdate=false 가 payload 에 포함되면 SUPER_ADMIN 이 권한 매트릭스를
    // 수정할 수단이 사라져 DB 직접 수정 외 복구 불가능한 시스템 lockout 발생.
    // ADM_PERMISSION/ADM_MENU/ADM_CODE 의 canRead=false 도 동일 — 관리 페이지 자체 접근 불가.
    if (parsedCode.data === "SUPER_ADMIN") {
      const permRow = result.data.permissions.find(
        (p) => p.menuCode === "ADM_PERMISSION",
      );
      if (permRow && permRow.canUpdate === false) {
        console.warn(
          "[PUT /api/roles/:roleCode/permissions] SUPER_ADMIN self-lockout 시도 차단 — ADM_PERMISSION.canUpdate=false",
        );
        return NextResponse.json(
          { error: "スーパー管理者の「権限管理」更新権限は無効化できません" },
          { status: 400 },
        );
      }
      const restrictedMenus = ["ADM_PERMISSION", "ADM_MENU", "ADM_CODE"];
      const readRevocation = result.data.permissions.find(
        (p) => restrictedMenus.includes(p.menuCode) && p.canRead === false,
      );
      if (readRevocation) {
        console.warn(
          `[PUT /api/roles/:roleCode/permissions] SUPER_ADMIN 관리메뉴 canRead 회수 시도 차단 — menuCode=${readRevocation.menuCode}`,
        );
        return NextResponse.json(
          { error: `スーパー管理者の「${readRevocation.menuCode}」閲覧権限は無効化できません` },
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
    // 사전 존재 검증(findMany) 이후 upsert 사이에 대상 메뉴가 삭제되는 경합 시 P2003(FK) 발생.
    // 500 대신 400 으로 승격해 "다시 메뉴관리 상태를 확인하고 재시도" UX 유도.
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      console.warn(
        "[PUT /api/roles/:roleCode/permissions] FK 경합 — 메뉴가 삭제됨",
        { code: error.code },
      );
      return NextResponse.json(
        { error: "対象のメニューが削除されました。メニュー管理を更新して再試行してください" },
        { status: 400 },
      );
    }
    console.error("[PUT /api/roles/:roleCode/permissions]", error);
    return NextResponse.json(
      { error: "権限の更新に失敗しました" },
      { status: 500 },
    );
  }
}
