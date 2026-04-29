import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { getUserFromHeaders, resolveMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMenuSchema } from "@/lib/schemas/menu";

// GET /api/menus — 메뉴 트리 목록.
//
// - activeOnly=true (기본): Gnb/AdminTab 용 네비게이션 조회. 요청자의 매트릭스 canRead=true 인
//   menuCode 만 반환 — 비관리자에게 ADMIN 하위 메뉴 구조를 숨겨 공격 표면 축소.
// - activeOnly=false: 관리자 메뉴관리 화면 전용. `ADM_MENU.read` 매트릭스 필요.
//   비활성 메뉴 포함 조회는 관리 목적이므로 일반 사용자에게 노출하지 않는다.
//
// ※ activeOnly=false 경로는 과거 `requireMenuPermission`(findFirst) + `allowedPerms`(findMany)
//    이중 쿼리였다. `resolveMenuPermission` 1회 호출로 가드 + allowedSet 재료를 동시 확보 —
//    ADM_MENU 열이 allowedSet 에 포함된다는 점을 이용해 DB 왕복 1회 절감.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 요청자 role 의 canRead=true 메뉴만 필터 — 응답 range 를 매트릭스로 좁힌다.
    // 관리 모드(activeOnly=false)에서는 비활성 메뉴도 포함해야 한다 — 비활성 메뉴를
    // 숨기면 사용자는 이미 존재하는 비활성 menuCode 를 인지하지 못한 채 신규 등록을
    // 시도해 409(Unique 충돌)를 받게 된다. 이때 화면 목록에는 보이지 않으니 원인 파악
    // 불가. 관리 모드에선 isActive 필터를 제거해 모든 메뉴를 노출.
    const allowedPerms = await prisma.qpRoleMenuPermission.findMany({
      where: {
        roleCode: user.role,
        canRead: true,
        ...(activeOnly && { menu: { isActive: true } }),
      },
      select: { menuCode: true },
    });
    const allowedSet = new Set(allowedPerms.map((p) => p.menuCode));

    // 비활성 포함 조회는 메뉴관리 화면 전용 — ADM_MENU.read 가 allowedSet 에 포함되어야 허용.
    // 별도 findFirst 를 호출하지 않고 위 findMany 결과를 재사용해 쿼리 수를 줄인다.
    if (!activeOnly && !allowedSet.has("ADM_MENU")) {
      return NextResponse.json(
        { error: "メニュー権限がありません" },
        { status: 403 },
      );
    }

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

    // 네비게이션 모드(activeOnly=true): 매트릭스에 없는 1-Level 메뉴는 통째로 제외,
    //   2-Level 도 허용된 것만. canRead 가 navigation 노출 권한이므로 적용.
    // 관리 모드(activeOnly=false): ADM_MENU.read 게이트(위)만으로 검증 완료.
    //   canRead 매트릭스는 navigation 가시성용이라 관리 화면에 적용하면 안 된다.
    //   (적용 시 권한 매트릭스에 미등록된 메뉴가 화면에서 사라져, 사용자가 인지 못한
    //    채 동일 menuCode 로 신규 등록 시 P2002 → 409 가 발생해 원인 파악 불가)
    const filtered = activeOnly
      ? menus
          .filter((m) => allowedSet.has(m.menuCode))
          .map((m) => ({
            ...m,
            children: m.children.filter((c) => allowedSet.has(c.menuCode)),
          }))
      : menus;

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
    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const perm = await resolveMenuPermission(user, "ADM_MENU");
    if (!perm.canCreate) {
      console.warn(
        `[POST /api/menus] 권한 거부 — role=${user.role}, menuCode=ADM_MENU, action=create`,
      );
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/menus] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = createMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が不正です", issues: result.error.issues },
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
          { error: "上位メニューが存在しません" },
          { status: 404 },
        );
      }

      if (parent.parentId !== null) {
        return NextResponse.json(
          { error: "2階層までのみ登録可能です" },
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
        { error: "既に存在するmenuCodeです" },
        { status: 409 },
      );
    }
    console.error("[POST /api/menus]", error);
    return NextResponse.json(
      { error: "メニューの作成に失敗しました" },
      { status: 500 },
    );
  }
}
