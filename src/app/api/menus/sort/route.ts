import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sortMenuSchema } from "@/lib/schemas/menu";

// PUT /api/menus/sort — 정렬순서 일괄 저장 (ADM_MENU.update — SUPER_ADMIN 전용)
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_MENU", "update");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/menus/sort] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = sortMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が不正です", issues: result.error.issues },
        { status: 400 },
      );
    }

    // ID 존재 여부 사전 조회 → 요청 items 의 parentId 그룹 수집
    const ids = result.data.items.map((item) => item.id);
    const existing = await prisma.menu.findMany({
      where: { id: { in: ids } },
      select: { id: true, parentId: true },
    });
    const existingMap = new Map(existing.map((m) => [m.id, m]));
    const missingIds = ids.filter((id) => !existingMap.has(id));

    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: "存在しないメニューが含まれています", missingIds },
        { status: 400 },
      );
    }

    // 요청 items 가 그룹의 부분집합인 경우에도 안전하게 재번호하기 위해
    // 해당 parentId 그룹의 모든 형제 row 를 조회 (요청에 없는 row 는 현재 sortOrder 유지)
    const targetParentIds = new Set<number | null>();
    for (const id of ids) {
      const prev = existingMap.get(id);
      if (prev) targetParentIds.add(prev.parentId);
    }
    const hasNullGroup = targetParentIds.has(null);
    const nonNullParentIds = [...targetParentIds].filter(
      (p): p is number => p !== null,
    );
    const siblingWhere =
      hasNullGroup && nonNullParentIds.length > 0
        ? { OR: [{ parentId: null }, { parentId: { in: nonNullParentIds } }] }
        : hasNullGroup
          ? { parentId: null }
          : { parentId: { in: nonNullParentIds } };
    const siblings = await prisma.menu.findMany({
      where: siblingWhere,
      select: { id: true, parentId: true, sortOrder: true },
    });

    // 요청 items 를 id → { newSort, seq } 맵으로
    const requestedMap = new Map<number, { newSort: number; seq: number }>();
    result.data.items.forEach((item, index) => {
      requestedMap.set(item.id, { newSort: item.sortOrder, seq: index });
    });

    // 삽입 정렬 방식 재번호 (그룹별 전체 형제 row 포함):
    // 1) 그룹별 분리 (siblings = 요청 parentId 그룹들의 모든 row)
    // 2) newSort asc (요청된 row 는 요청값, 미요청 row 는 현재 sortOrder 유지)
    // 3) 동일값이면 이동 방향(위→앞 / 유지 / 아래→뒤) + 요청 row 우선 + 요청 배열 순서(stable)
    // 4) 1..N 으로 재번호하여 변경 필요한 row 만 저장
    type Entry = {
      id: number;
      newSort: number;
      oldSort: number;
      seq: number;
      requested: boolean;
    };

    const groups = new Map<number | null, Entry[]>();
    for (const sib of siblings) {
      const req = requestedMap.get(sib.id);
      const entry: Entry = {
        id: sib.id,
        newSort: req?.newSort ?? sib.sortOrder,
        oldSort: sib.sortOrder,
        seq: req?.seq ?? Number.MAX_SAFE_INTEGER,
        requested: req !== undefined,
      };
      const arr = groups.get(sib.parentId) ?? [];
      arr.push(entry);
      groups.set(sib.parentId, arr);
    }

    // 위로 이동(newSort < oldSort) 0, 유지 1, 아래로 이동 2
    const directionRank = (e: Entry) =>
      e.newSort < e.oldSort ? 0 : e.newSort > e.oldSort ? 2 : 1;

    const updates: Array<{ id: number; sortOrder: number }> = [];
    for (const arr of groups.values()) {
      arr.sort(
        (a, b) =>
          a.newSort - b.newSort ||
          directionRank(a) - directionRank(b) ||
          // 동일 newSort/방향에서 요청된 row 가 미요청 row 보다 앞
          (a.requested === b.requested ? 0 : a.requested ? -1 : 1) ||
          // 요청된 row 끼리는 요청 배열 순서(seq asc), 미요청 row 끼리는 oldSort asc
          (a.requested && b.requested
            ? a.seq - b.seq
            : a.oldSort - b.oldSort),
      );
      arr.forEach((e, idx) => {
        const nextOrder = idx + 1;
        if (nextOrder !== e.oldSort) {
          updates.push({ id: e.id, sortOrder: nextOrder });
        }
      });
    }

    // 변경이 필요한 항목만 트랜잭션 업데이트
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.menu.update({
            where: { id: u.id },
            data: { sortOrder: u.sortOrder },
          }),
        ),
      );
    }

    return NextResponse.json({ data: { updated: updates.length } });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "存在しないメニューが含まれています" },
        { status: 404 },
      );
    }
    console.error("[PUT /api/menus/sort]", error);
    return NextResponse.json(
      { error: "並び順の更新に失敗しました" },
      { status: 500 },
    );
  }
}
