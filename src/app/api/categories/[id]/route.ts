import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCategorySchema } from "@/lib/schemas/category";

type Params = { params: Promise<{ id: string }> };

// BFS 안전 한도 — cascade-preview 와 동일 값으로 동기 유지(영향 범위 일관성).
// 비정상적으로 큰 트리(잘못된 마이그레이션 결과 등)에서 무한 루프/대량 쿼리를 차단.
const MAX_DESCENDANTS = 10_000;

// PUT /api/categories/:id — 카테고리 수정 (ADM_CATEGORY.update 매트릭스 기반)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CATEGORY", "update");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn("[PUT /api/categories/:id] Request body 파싱 실패:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = updateCategorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    let reorderLog: {
      categoryId: number;
      parentId: number | null;
      oldOrder: number;
      newOrder: number;
      direction: "up" | "down";
      shiftedCount: number;
    } | null = null;

    const category = await prisma.$transaction(
      async (tx) => {
        // sortOrder가 명시적으로 전달된 경우에만 같은 parentId 형제들 자동 재정렬
        // NOTE: parentId는 updateCategorySchema에서 수정 불가. 변경 시 이 로직도 수정 필요
        if (result.data.sortOrder !== undefined) {
          const current = await tx.category.findUnique({
            where: { id: parsed.data },
            select: { parentId: true, sortOrder: true },
          });

          if (!current) {
            throw new Error("NOT_FOUND");
          }

          const newOrder = result.data.sortOrder;
          if (newOrder < current.sortOrder) {
            // 위로 이동: [newOrder, oldOrder) 범위 형제 +1
            const shifted = await tx.category.updateMany({
              where: {
                parentId: current.parentId,
                id: { not: parsed.data },
                sortOrder: { gte: newOrder, lt: current.sortOrder },
              },
              data: { sortOrder: { increment: 1 } },
            });
            reorderLog = {
              categoryId: parsed.data,
              parentId: current.parentId,
              oldOrder: current.sortOrder,
              newOrder,
              direction: "up",
              shiftedCount: shifted.count,
            };
          } else if (newOrder > current.sortOrder) {
            // 아래로 이동: (oldOrder, newOrder] 범위 형제 -1
            const shifted = await tx.category.updateMany({
              where: {
                parentId: current.parentId,
                id: { not: parsed.data },
                sortOrder: { gt: current.sortOrder, lte: newOrder },
              },
              data: { sortOrder: { decrement: 1 } },
            });
            reorderLog = {
              categoryId: parsed.data,
              parentId: current.parentId,
              oldOrder: current.sortOrder,
              newOrder,
              direction: "down",
              shiftedCount: shifted.count,
            };
          }
          // newOrder === current.sortOrder: 형제 재정렬 불필요
        }

        return tx.category.update({
          where: { id: parsed.data },
          data: result.data,
        });
      },
      { isolationLevel: "Serializable" },
    );

    if (reorderLog) {
      console.log("[PUT /api/categories/:id] sortOrder 재정렬", reorderLog);
    }

    return NextResponse.json({ data: category });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[PUT /api/categories/:id]", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 },
    );
  }
}

// DELETE /api/categories/:id — 카테고리 삭제 (물리 삭제, ADM_CATEGORY.delete 매트릭스 기반)
//
// 정책 (2026-04-27 변경):
//   - 하위 카테고리가 존재해도 삭제 허용 → 자손 카테고리 전체 cascade 삭제.
//   - Prisma 스키마의 self-relation `onDelete: Cascade` 로 DB 엔진이 자손 트리 자동 정리.
//   - 각 카테고리의 ContentCategory 링크도 기존 cascade 정책으로 함께 정리(콘텐츠 본체 보존).
//
// 감사 로그: 삭제 전에 자손 카테고리 ID 와 ContentCategory 링크를 선조회해 cascade 결과를
// 명시적으로 기록 (DB 엔진의 silent cascade 가 운영 추적에서 보이지 않게 되는 문제 방지).
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CATEGORY", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // isolationLevel: Serializable — 자손 카테고리 카운트와 delete 사이에 다른 세션이
    // child 를 추가/이동하는 TOCTOU race 차단 (PUT 핸들러와 동일 기준).
    const deleted = await prisma.$transaction(
      async (tx) => {
        // 1. 자손 카테고리 ID 수집 (BFS, 트리 깊이만큼 쿼리 발생).
        //    재귀 CTE 대신 iterative — Prisma 표준 API 만으로 구현, 가독성 우선.
        //    트리 깊이가 매우 큰 경우 raw SQL CTE 로 1쿼리 전환 검토.
        const descendantIds: number[] = [];
        let frontier: number[] = [parsed.data];
        while (frontier.length > 0) {
          // 안전 가드 — 비정상 데이터(자기 참조 사이클·잘못된 마이그레이션 등)에 의한
          // 무한 루프 방지. 상한 초과 시 트랜잭션 롤백 후 422 응답.
          if (descendantIds.length >= MAX_DESCENDANTS) {
            throw new Error("MAX_DESCENDANTS_EXCEEDED");
          }
          const children = await tx.category.findMany({
            where: { parentId: { in: frontier } },
            select: { id: true },
          });
          if (children.length === 0) break;
          const childIds = children.map((c) => c.id);
          descendantIds.push(...childIds);
          frontier = childIds;
        }

        // 2. cascade 로 정리될 ContentCategory 링크 선조회 (감사 로그용).
        //    root + 자손 모두 포함. 실제 삭제는 DB cascade 가 처리.
        const affectedCategoryIds = [parsed.data, ...descendantIds];
        const affectedLinks = await tx.contentCategory.findMany({
          where: { categoryId: { in: affectedCategoryIds } },
          select: { contentId: true, categoryId: true },
        });

        // 3. root 삭제 → DB 엔진이 자손 카테고리 + 모든 ContentCategory 링크 cascade 삭제.
        await tx.category.delete({ where: { id: parsed.data } });

        return {
          id: parsed.data,
          cascadedCategoryIds: descendantIds,
          cascadedContentLinks: affectedLinks,
        };
      },
      { isolationLevel: "Serializable" },
    );

    // 구조적 감사 로그 — PII 없음(ID만). 운영 복구/추적용.
    // cascade 가 발생한 경우(자손 카테고리 또는 ContentCategory 링크가 있는 경우)에만 출력.
    if (
      deleted.cascadedCategoryIds.length > 0 ||
      deleted.cascadedContentLinks.length > 0
    ) {
      console.info("[DELETE /api/categories/:id] cascade removed", {
        categoryId: deleted.id,
        cascadedCategoryCount: deleted.cascadedCategoryIds.length,
        cascadedCategoryIds: deleted.cascadedCategoryIds,
        cascadedContentLinkCount: deleted.cascadedContentLinks.length,
      });
    }

    return NextResponse.json({
      data: {
        id: deleted.id,
        cascadedCategoryCount: deleted.cascadedCategoryIds.length,
        cascadedContentCount: deleted.cascadedContentLinks.length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MAX_DESCENDANTS_EXCEEDED") {
      console.warn("[DELETE /api/categories/:id] MAX_DESCENDANTS 초과");
      return NextResponse.json(
        { error: "Too many descendants to delete in a single request" },
        { status: 422 },
      );
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/categories/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 },
    );
  }
}
