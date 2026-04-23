import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { getUserFromHeaders, requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMenuSchema } from "@/lib/schemas/menu";

// GET /api/menus — 메뉴 트리 목록.
//
// - activeOnly=true (기본): Gnb/AdminTab 용 네비게이션 조회. 요청자의 매트릭스 canRead=true 인
//   menuCode 만 반환 — 비관리자에게 ADMIN 하위 메뉴 구조를 숨겨 공격 표면 축소.
// - activeOnly=false: 관리자 메뉴관리 화면 전용. `ADM_MENU.read` 매트릭스 필요.
//   비활성 메뉴 포함 조회는 관리 목적이므로 일반 사용자에게 노출하지 않는다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 비활성 포함 조회는 메뉴관리 화면 전용 — ADM_MENU.read 매트릭스로 방어
    if (!activeOnly) {
      const auth = await requireMenuPermission(request.headers, "ADM_MENU", "read");
      if (auth instanceof NextResponse) return auth;
    }

    // 요청자 role 의 canRead=true 메뉴만 필터 — 응답 range 를 매트릭스로 좁힌다.
    const allowedPerms = await prisma.qpRoleMenuPermission.findMany({
      where: { roleCode: user.role, canRead: true, menu: { isActive: true } },
      select: { menuCode: true },
    });
    const allowedSet = new Set(allowedPerms.map((p) => p.menuCode));

    const menus = await prisma.menu.findMany({
      where: {
        parentId: null,
        ...(activeOnly && { isActive: true }),
      },
      include: {
        children: {
          where: {
            ...(activeOnly && { isActive: true }),
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    // 매트릭스에 없는 1-Level 메뉴는 통째로 제외, 2-Level 도 허용된 것만.
    const filtered = menus
      .filter((m) => allowedSet.has(m.menuCode))
      .map((m) => ({
        ...m,
        children: m.children.filter((c) => allowedSet.has(c.menuCode)),
      }));

    return NextResponse.json({ data: filtered });
  } catch (error) {
    console.error("[GET /api/menus]", error);
    return NextResponse.json(
      { error: "メニュー一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/menus — 메뉴 등록 (ADM_MENU.create — SUPER_ADMIN 전용, ADMIN 은 403)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_MENU", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 2레벨 제한: parent의 parentId가 not null이면 3레벨 → 거부
    if (result.data.parentId !== null) {
      const parent = await prisma.menu.findUnique({
        where: { id: result.data.parentId },
        select: { parentId: true },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "상위 메뉴가 존재하지 않습니다" },
          { status: 404 },
        );
      }

      if (parent.parentId !== null) {
        return NextResponse.json(
          { error: "2레벨까지만 등록 가능합니다" },
          { status: 400 },
        );
      }
    }

    // sortOrder 미지정 시 같은 parentId 그룹의 max(sortOrder)+1 로 자동 부여
    // aggregate + create 를 하나의 트랜잭션으로 묶어 동시 POST 시 sortOrder 중복 방지
    const menu = await prisma.$transaction(async (tx) => {
      let sortOrder = result.data.sortOrder;
      if (sortOrder === undefined) {
        const agg = await tx.menu.aggregate({
          where: { parentId: result.data.parentId },
          _max: { sortOrder: true },
        });
        sortOrder = (agg._max.sortOrder ?? 0) + 1;
      }
      return tx.menu.create({
        data: { ...result.data, sortOrder },
      });
    });
    return NextResponse.json({ data: menu }, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 존재하는 menuCode입니다" },
        { status: 409 },
      );
    }
    console.error("[POST /api/menus]", error);
    return NextResponse.json(
      { error: "Failed to create menu" },
      { status: 500 },
    );
  }
}
