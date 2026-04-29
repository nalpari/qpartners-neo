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
// - 하위 메뉴 보유 시: cascade 삭제 — 자식 메뉴 + 자식 권한 매트릭스도 함께 제거.
//   (메뉴는 2-level 제한이지만 schema 우회/직접 DB 입력 가능성을 고려해 손자 발견 시 명시 거부.)
// - 권한 매트릭스(`QpRoleMenuPermission`) 행은 menuCode FK 제약으로 메뉴 삭제 전 선삭제 필요 —
//   대상 + 자식들의 menuCode 를 한 번에 수집해 deleteMany 로 처리.
// - 같은 parentId 그룹 형제들의 sortOrder 를 삭제 직후 1..N 으로 재번호 → 중간 공백/스킵 제거.
// - 응답 deletedChildren 으로 cascade 된 자식 수, resequenced 로 sortOrder 가 변경된 형제 수 노출.
// - 조회 + 변경을 interactive transaction 으로 묶어 TOCTOU 차단 (다른 mutation 이 children/
//   siblings 를 변경해 cascade/재번호가 stale 데이터 기준으로 일어나는 사고 방지).
//
// 사용자 메시지(일본어) 와 별개로 P2025(Prisma "record not found") 는 동시 삭제 race 시
// 트랜잭션 내부에서 발생할 수 있어 외부 catch 에서 404 매핑.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_MENU", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
    }
    const targetId = parsed.data;

    // 손자 깊이 가드 — schema 가 onDelete: SetNull 이라 손자가 있으면 cascade 누락 시
    // parentId=null 로 둔갑(1-level 으로 leak)되는 silent data corruption 위험.
    // 명시 거부하여 운영자가 인지 후 수동 정리하도록 유도.
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.menu.findUnique({
        where: { id: targetId },
        select: {
          menuCode: true,
          parentId: true,
          children: {
            select: {
              id: true,
              menuCode: true,
              _count: { select: { children: true } },
            },
          },
        },
      });

      if (!target) {
        return { kind: "not_found" as const };
      }

      const grandchildExists = target.children.some((c) => c._count.children > 0);
      if (grandchildExists) {
        return { kind: "depth_violation" as const };
      }

      const cascadeMenuCodes = [
        target.menuCode,
        ...target.children.map((c) => c.menuCode),
      ];
      const childIds = target.children.map((c) => c.id);

      // 형제(삭제 대상 제외) 조회 — 트랜잭션 내부 시점 기준이라 stale 위험 없음.
      const siblings = await tx.menu.findMany({
        where: {
          parentId: target.parentId,
          id: { not: targetId },
        },
        select: { id: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });

      // 현재 sortOrder 와 새 위치(1-indexed)가 다른 행만 update 대상 — 불필요한 write 회피.
      const reseqUpdates = siblings
        .map((sib, idx) => ({
          id: sib.id,
          oldSort: sib.sortOrder,
          newSort: idx + 1,
        }))
        .filter((u) => u.oldSort !== u.newSort);

      // 1) 권한 매트릭스 행 선삭제 (FK)
      await tx.qpRoleMenuPermission.deleteMany({
        where: { menuCode: { in: cascadeMenuCodes } },
      });
      // 2) 자식 메뉴 일괄 삭제 (있을 때만)
      if (childIds.length > 0) {
        await tx.menu.deleteMany({ where: { id: { in: childIds } } });
      }
      // 3) 대상 메뉴 삭제
      await tx.menu.delete({ where: { id: targetId } });
      // 4) 같은 parentId 그룹 형제 1..N 재번호 — 순차 update (Prisma 가 batch SQL 자동 최적화)
      for (const u of reseqUpdates) {
        await tx.menu.update({
          where: { id: u.id },
          data: { sortOrder: u.newSort },
        });
      }

      return {
        kind: "ok" as const,
        deletedChildren: childIds.length,
        resequenced: reseqUpdates.length,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "指定されたメニューが見つかりません" },
        { status: 404 },
      );
    }
    if (result.kind === "depth_violation") {
      return NextResponse.json(
        { error: "孫メニューが存在するため削除できません。データ構造を確認してください。" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      data: {
        id: targetId,
        deletedChildren: result.deletedChildren,
        resequenced: result.resequenced,
      },
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
