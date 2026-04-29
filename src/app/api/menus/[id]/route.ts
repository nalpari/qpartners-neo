import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateMenuSchema } from "@/lib/schemas/menu";

type Params = { params: Promise<{ id: string }> };

// PUT /api/menus/:id — 메뉴 수정 (ADM_MENU.update — SUPER_ADMIN 전용, ADMIN 은 403)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_MENU", "update");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/menus/:id] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = updateMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が不正です", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新対象のフィールドがありません" },
        { status: 400 },
      );
    }

    const menu = await prisma.menu.update({
      where: { id: parsed.data },
      data: result.data,
    });

    return NextResponse.json({ data: menu });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "指定されたメニューが見つかりません" }, { status: 404 });
    }
    console.error("[PUT /api/menus/:id]", error);
    return NextResponse.json(
      { error: "メニューの更新に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/menus/:id — 메뉴 삭제 (ADM_MENU.delete — SUPER_ADMIN 전용)
//
// - 하위 메뉴 보유 시 409 — 고아 행 발생 방지(스키마상 `onDelete: SetNull` 이지만 운영 의도는
//   "선 하위 정리 후 상위 삭제" 이므로 명시적으로 차단). 사용자에게 원인 안내.
// - 권한 매트릭스(`QpRoleMenuPermission`) 행은 menuCode FK 제약으로 메뉴 삭제 전 선삭제 필요.
// - 같은 parentId 그룹 형제들의 sortOrder 를 삭제 직후 1..N 으로 재번호 → 중간 공백/스킵 제거.
//   모두 같은 트랜잭션으로 묶어 부분 실패 시 일관성 보장.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_MENU", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
    }

    const target = await prisma.menu.findUnique({
      where: { id: parsed.data },
      select: {
        menuCode: true,
        parentId: true,
        _count: { select: { children: true } },
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: "指定されたメニューが見つかりません" },
        { status: 404 },
      );
    }

    if (target._count.children > 0) {
      return NextResponse.json(
        { error: "下位メニューが存在するため削除できません。先に下位メニューを削除してください。" },
        { status: 409 },
      );
    }

    // 같은 그룹의 형제(삭제 대상 제외)를 sortOrder asc 로 조회 — 삭제 후 1..N 재번호 대상.
    // 트랜잭션 시작 전에 조회해도 안전: DELETE 트랜잭션 내부에서 형제 행만 update 하므로
    // race 가능성은 동일 그룹의 다른 동시 mutation 인데, sortOrder 정렬 mutation 들은
    // 모두 SUPER_ADMIN 전용이라 운영상 동시 발생 빈도가 매우 낮음 (fail-acceptable).
    const siblings = await prisma.menu.findMany({
      where: {
        parentId: target.parentId,
        id: { not: parsed.data },
      },
      select: { id: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });

    // 현재 sortOrder 와 새 위치(1-indexed)가 다른 행만 update 대상 — 불필요한 write 회피.
    const reseqUpdates = siblings
      .map((sib, idx) => ({ id: sib.id, oldSort: sib.sortOrder, newSort: idx + 1 }))
      .filter((u) => u.oldSort !== u.newSort);

    await prisma.$transaction([
      prisma.qpRoleMenuPermission.deleteMany({
        where: { menuCode: target.menuCode },
      }),
      prisma.menu.delete({ where: { id: parsed.data } }),
      ...reseqUpdates.map((u) =>
        prisma.menu.update({
          where: { id: u.id },
          data: { sortOrder: u.newSort },
        }),
      ),
    ]);

    return NextResponse.json({
      data: { id: parsed.data, resequenced: reseqUpdates.length },
    });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "指定されたメニューが見つかりません" },
        { status: 404 },
      );
    }
    console.error("[DELETE /api/menus/:id]", error);
    return NextResponse.json(
      { error: "メニューの削除に失敗しました" },
      { status: 500 },
    );
  }
}
