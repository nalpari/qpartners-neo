import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sortMenuSchema } from "@/lib/schemas/menu";

// PUT /api/menus/sort — 정렬순서 일괄 저장
export async function PUT(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
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

    const result = sortMenuSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // ID 존재 여부 + parentId/sortOrder 사전 조회 (그룹 재번호에 사용)
    const ids = result.data.items.map((item) => item.id);
    const existing = await prisma.menu.findMany({
      where: { id: { in: ids } },
      select: { id: true, parentId: true, sortOrder: true },
    });
    const existingMap = new Map(existing.map((m) => [m.id, m]));
    const missingIds = ids.filter((id) => !existingMap.has(id));

    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: "존재하지 않는 메뉴가 포함되어 있습니다", missingIds },
        { status: 400 },
      );
    }

    // 삽입 정렬 방식 재번호:
    // 1) 같은 parentId 그룹으로 분리 (요청 items 범위 내 — 화면에 보이는 그룹만 재번호)
    // 2) 그룹별로 newSort asc 정렬, 동일값이면 이동 방향(위→앞 / 아래→뒤) + 요청 배열 순서(stable) 유지
    // 3) 1..N 으로 재번호하여 저장
    type Entry = {
      id: number;
      newSort: number;
      oldSort: number;
      seq: number; // 요청 배열 내 등장 순서 (stable sort 보조)
    };

    const groups = new Map<number | null, Entry[]>();
    result.data.items.forEach((item, index) => {
      const prev = existingMap.get(item.id)!;
      const entry: Entry = {
        id: item.id,
        newSort: item.sortOrder,
        oldSort: prev.sortOrder,
        seq: index,
      };
      const arr = groups.get(prev.parentId) ?? [];
      arr.push(entry);
      groups.set(prev.parentId, arr);
    });

    // 위로 이동(newSort < oldSort) 0, 유지 1, 아래로 이동 2
    const directionRank = (e: Entry) =>
      e.newSort < e.oldSort ? 0 : e.newSort > e.oldSort ? 2 : 1;

    const updates: Array<{ id: number; sortOrder: number }> = [];
    for (const arr of groups.values()) {
      arr.sort(
        (a, b) =>
          a.newSort - b.newSort ||
          directionRank(a) - directionRank(b) ||
          a.seq - b.seq,
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
        { error: "존재하지 않는 메뉴가 포함되어 있습니다" },
        { status: 404 },
      );
    }
    console.error("[PUT /api/menus/sort]", error);
    return NextResponse.json(
      { error: "Failed to update sort order" },
      { status: 500 },
    );
  }
}
