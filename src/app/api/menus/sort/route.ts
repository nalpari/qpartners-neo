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

    // 그룹별 anchor + greedy 배치:
    //  1) 요청 row 는 newSort 를 anchor 로 우선 점유 (1..N 으로 clamp).
    //     동일 anchor 충돌 시: directionRank(위 이동 우선) → seq 순으로 다음 빈 슬롯 탐색.
    //  2) 미요청 row 는 oldSort 순으로 남은 빈 슬롯을 채움 → 상대 순서 유지.
    //
    // 기존 알고리즘은 모든 row 를 newSort 로 함께 정렬해 1..N 으로 재번호했는데, 이 방식은
    // 요청된 row 와 미요청 row 가 동일 newSort 에서 경쟁하면서 미요청 row 가 요청 row 의
    // 다음 슬롯을 가로채 다른 요청 row 의 목표 위치를 침범하는 문제가 있었다.
    //   예) A=1,B=2,C=3,D=4,E=5 에서 D→3, E→4 요청 시
    //       기존: A=1,B=2,D=3,C=4,E=5 (E 변경 누락 — C 가 4 슬롯 가로챔)
    //       신규: A=1,B=2,D=3,E=4,C=5 (요청 anchor 보존)
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
      const N = arr.length;
      if (N === 0) continue;

      const requested = arr.filter((e) => e.requested);
      const nonRequested = arr.filter((e) => !e.requested);

      // 요청 row: newSort asc → directionRank asc → seq asc 로 anchor 우선순위 결정
      requested.sort(
        (a, b) =>
          a.newSort - b.newSort ||
          directionRank(a) - directionRank(b) ||
          a.seq - b.seq,
      );
      // 미요청 row: oldSort 순으로 남은 슬롯에 채울 순서
      nonRequested.sort((a, b) => a.oldSort - b.oldSort);

      // 1-indexed 슬롯 (placed[0] 미사용)
      const placed: (Entry | null)[] = new Array(N + 1).fill(null);

      const findNextEmpty = (from: number): number => {
        for (let p = from; p <= N; p++) if (!placed[p]) return p;
        for (let p = 1; p < from; p++) if (!placed[p]) return p;
        return -1;
      };

      // 요청 row anchor 배치
      for (const e of requested) {
        const target = Math.max(1, Math.min(N, e.newSort));
        const slot = placed[target] ? findNextEmpty(target + 1) : target;
        if (slot >= 1) placed[slot] = e;
      }

      // 미요청 row 는 빈 슬롯에 oldSort 순으로 채움
      let nrIdx = 0;
      for (let pos = 1; pos <= N; pos++) {
        if (placed[pos]) continue;
        if (nrIdx < nonRequested.length) {
          placed[pos] = nonRequested[nrIdx++];
        }
      }

      for (let pos = 1; pos <= N; pos++) {
        const e = placed[pos];
        if (e && pos !== e.oldSort) {
          updates.push({ id: e.id, sortOrder: pos });
        }
      }
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
