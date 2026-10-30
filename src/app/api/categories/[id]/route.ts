import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema, updateCategorySchema } from "@/lib/schemas/category";

import {
  CATEGORY_MAX_DESCENDANTS,
  CategoryError,
  MaxDescendantsExceededError,
} from "../_constants";

type Params = { params: Promise<{ id: string }> };

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

    // isVisible 은 1Depth(parentId === null) 전용 — 자식 카테고리에는 의미가 없으므로
    // 클라이언트가 잘못 보내더라도 서버 단에서 명시적으로 거절(400)한다.
    // 1Depth 여부는 트랜잭션 외부에서 단일 SELECT 로 먼저 확인 (race 가능성 없음 — parentId 는 updateCategorySchema 에서 수정 불가).
    if (result.data.isVisible !== undefined) {
      const current = await prisma.category.findUnique({
        where: { id: parsed.data },
        select: { parentId: true },
      });
      if (!current) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (current.parentId !== null) {
        return NextResponse.json(
          { error: "isVisible は 1Depth カテゴリ専用です" },
          { status: 400 },
        );
      }
    }

    let reorderLog: {
      categoryId: number;
      parentId: number | null;
      oldOrder: number;
      newOrder: number;
      direction: "up" | "down";
      shiftedCount: number;
    } | null = null;

    const {
      category,
      internalCascadeCount,
      internalParentReleased,
      productListCascadeCount,
    } = await prisma.$transaction(
      async (tx) => {
        // sortOrder가 명시적으로 전달된 경우에만 같은 parentId 형제들 자동 재정렬
        // NOTE: parentId는 updateCategorySchema에서 수정 불가. 변경 시 이 로직도 수정 필요
        if (result.data.sortOrder !== undefined) {
          const current = await tx.category.findUnique({
            where: { id: parsed.data },
            select: { parentId: true, sortOrder: true },
          });

          if (!current) {
            throw new CategoryError("NOT_FOUND");
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

        const updated = await tx.category.update({
          where: { id: parsed.data },
          data: result.data,
        });

        // 사내전용 하위 전파 — 1Depth 의 `社内会員専用` 은 **하위 전체 선택 토글**이다.
        //
        // 2026-10-23 사용자 지시로 `製品一覧表示` 와 **같은 규칙**이 됐다. 종전에는 Y 만
        // 전파하고 Y→N 은 자식 설정을 보존했는데, 그 결과 1Depth 를 N 으로 되돌려도 자식이
        // Y 로 남아 좌측 필터·목록에 적색 분류가 그대로 보였다 — 조작과 결과가 어긋난다.
        // 개별 2Depth 는 전파 후에 따로 켜고 끌 수 있고, 그러면 1Depth 표시가 N 으로 보인다
        // (표시는 자식 전원 Y 여부에서 파생 — categories-types.ts#resolveInternalOnlyValue).
        //
        // 대상이 2Depth 면 전파하지 않는다 (카테고리는 Depth-2 까지만 관리).
        // 같은 트랜잭션(Serializable) 안이라 부모와 자식이 어긋난 중간 상태가 노출되지 않는다.
        let cascadedChildCount = 0;
        if (result.data.isInternalOnly !== undefined && updated.parentId === null) {
          const cascaded = await tx.category.updateMany({
            where: {
              parentId: parsed.data,
              isInternalOnly: { not: result.data.isInternalOnly },
            },
            data: { isInternalOnly: result.data.isInternalOnly },
          });
          cascadedChildCount = cascaded.count;
        }

        // 2Depth 를 공개(N)로 되돌릴 때는 **부모도 함께 N 으로 내린다.**
        //
        // 노출 판정(`category-tree.ts#shouldShow`)은 부모를 먼저 보고, 부모가 Y 면 자식 값과
        // 무관하게 그 축 전체를 숨긴다(축 제목이 1Depth 이름이라 자식만 내보내면 사내 분류명이
        // 드러나기 때문 — 이 동작 자체는 의도대로다). 문제는 부모 값이 Y 로 남는 조합이다:
        //   - 방금 N 으로 바꾼 자식조차 비사내 사용자에게 보이지 않는다
        //   - 1Depth 표시값은 자식에서 파생(`resolveInternalOnlyValue` = 자식 전원 Y 일 때만 Y)
        //     되므로 화면에는 N 으로 보인다 → 화면과 실제가 어긋난다
        //   - 폼이 「파생값과 다를 때만 전송」이라 1Depth 를 N 으로 눌러도 전송되지 않아,
        //     UI 로 되돌리려면 Y 저장(전체 Y 전파) → N 저장(전체 N 전파) 밖에 없다
        //
        // 형제는 건드리지 않는다 — 각자 Y 면 자기 값으로 계속 숨겨진다. 결과적으로 운영자가
        // 조작한 그대로 「그 2Depth 하나만 공개」가 된다.
        let parentReleased = false;
        if (result.data.isInternalOnly === false && updated.parentId !== null) {
          const released = await tx.category.updateMany({
            where: { id: updated.parentId, isInternalOnly: true },
            data: { isInternalOnly: false },
          });
          parentReleased = released.count > 0;
        }

        // 제품일람 하위 전파 — 1Depth 의 `製品一覧表示` 는 **하위 전체 선택 토글**이다
        // (목업 04 안내 문구: 「下位カテゴリ全体に適用 · 下位項目に N がある場合、上位項目も N と表示」).
        //
        // 사내전용 전파와 달리 **양방향**이다. 사내전용은 노출 범위를 좁히는 쪽만 전파해
        // (Y→N 은 자식 설정 보존) 되돌릴 때 자식 설정이 날아가지 않게 하지만, 이쪽은
        // 「전체 선택」 체크박스라 해제도 전체에 적용돼야 조작과 결과가 일치한다.
        // 개별 2Depth 는 그 뒤에 따로 켜고 끌 수 있고, 그러면 1Depth 표시가 N 으로 보인다
        // (표시는 자식 전원 Y 여부에서 파생 — categories-types.ts#resolveProductListValue).
        //
        // 형번은 2Depth 에만 붙으므로(`assertProductCategory`) 1Depth 자체 값은 기능에
        // 쓰이지 않는다. 전파가 없으면 1Depth 체크박스는 아무 효과 없는 장식이 된다.
        let productListCascadedCount = 0;
        if (result.data.isProductList !== undefined) {
          const isParent = updated.parentId === null;
          if (isParent) {
            const cascaded = await tx.category.updateMany({
              where: {
                parentId: parsed.data,
                isProductList: { not: result.data.isProductList },
              },
              data: { isProductList: result.data.isProductList },
            });
            productListCascadedCount = cascaded.count;
          }
        }

        return {
          category: updated,
          internalCascadeCount: cascadedChildCount,
          internalParentReleased: parentReleased,
          productListCascadeCount: productListCascadedCount,
        };
      },
      { isolationLevel: "Serializable" },
    );

    if (reorderLog) {
      console.log("[PUT /api/categories/:id] sortOrder 재정렬", reorderLog);
    }

    // 구조적 감사 로그 — PII 없음(ID/건수만). 사내전용 승격은 노출 범위를 좁히는 변경이라 추적 대상.
    if (internalCascadeCount > 0) {
      console.info("[PUT /api/categories/:id] 사내전용 하위 전파", {
        categoryId: parsed.data,
        cascadedChildCount: internalCascadeCount,
      });
    }

    // 부모 해제는 **노출 범위를 넓히는** 변경이라 승격보다 더 중요한 추적 대상이다.
    if (internalParentReleased) {
      console.info("[PUT /api/categories/:id] 사내전용 부모 해제", {
        categoryId: parsed.data,
        parentId: category.parentId,
      });
    }

    // 제품일람 전파는 검색화면 형번축·형번관리 선택지를 한꺼번에 바꾸므로 추적 대상.
    if (productListCascadeCount > 0) {
      console.info("[PUT /api/categories/:id] 제품일람 하위 전파", {
        categoryId: parsed.data,
        isProductList: result.data.isProductList,
        cascadedChildCount: productListCascadeCount,
      });
    }

    return NextResponse.json({ data: category });
  } catch (error) {
    if (error instanceof CategoryError && error.kind === "NOT_FOUND") {
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
          if (descendantIds.length >= CATEGORY_MAX_DESCENDANTS) {
            throw new MaxDescendantsExceededError();
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

        // 2. cascade 로 정리될 ContentCategory 링크 카운트만 집계 (감사 로그용).
        //    root + 자손 모두 포함. 실제 삭제는 DB cascade 가 처리.
        //    카운트만 사용하므로 findMany → count 로 메모리 비용 O(N) → O(1).
        const affectedCategoryIds = [parsed.data, ...descendantIds];
        const cascadedContentLinkCount = await tx.contentCategory.count({
          where: { categoryId: { in: affectedCategoryIds } },
        });

        // 형번 마스터도 같은 cascade 로 사라진다 (`ProductModel.category` onDelete: Cascade).
        // 복구는 백업뿐이므로 「몇 건이 사라졌는가」가 로그에 남아야 한다.
        const cascadedProductModelCount = await tx.productModel.count({
          where: { categoryId: { in: affectedCategoryIds } },
        });
        const cascadedProductModelLinkCount = await tx.contentProductModel.count({
          where: { productModel: { categoryId: { in: affectedCategoryIds } } },
        });

        // 3. 형제 재정렬용 — 삭제 대상의 parentId / sortOrder 미리 확보.
        //    delete 후엔 row 가 사라져 조회 불가하므로 반드시 delete 이전 시점.
        const target = await tx.category.findUnique({
          where: { id: parsed.data },
          select: { parentId: true, sortOrder: true },
        });
        if (!target) {
          throw new CategoryError("NOT_FOUND");
        }

        // 4. root 삭제 → DB 엔진이 자손 카테고리 + 모든 ContentCategory 링크 cascade 삭제.
        await tx.category.delete({ where: { id: parsed.data } });

        // 5. 같은 부모(parentId) 형제들 sortOrder 갭 제거 — 더 큰 값들 -1.
        //    parentId 가 null(최상위) 인 경우도 동일 처리. 자손은 cascade 로 통째로 사라지므로
        //    그 안쪽의 형제 재정렬은 불필요(갭 자체가 생기지 않음).
        const reordered = await tx.category.updateMany({
          where: {
            parentId: target.parentId,
            sortOrder: { gt: target.sortOrder },
          },
          data: { sortOrder: { decrement: 1 } },
        });

        return {
          id: parsed.data,
          cascadedCategoryIds: descendantIds,
          cascadedContentLinkCount,
          cascadedProductModelCount,
          cascadedProductModelLinkCount,
          reorderedSiblingCount: reordered.count,
          parentId: target.parentId,
          removedSortOrder: target.sortOrder,
        };
      },
      { isolationLevel: "Serializable" },
    );

    // 구조적 감사 로그 — PII 없음(ID만). 운영 복구/추적용.
    // cascade 또는 형제 재정렬이 발생한 경우 출력.
    // ID 배열은 최대 50개까지만 인라인 — 상한(CATEGORY_MAX_DESCENDANTS=10000) 도달 시
    // 단일 로그 엔트리가 비대해져 로그 수집/검색 부담을 키우는 것 방지.
    if (
      deleted.cascadedCategoryIds.length > 0 ||
      deleted.cascadedContentLinkCount > 0 ||
      deleted.cascadedProductModelCount > 0 ||
      deleted.reorderedSiblingCount > 0
    ) {
      const AUDIT_ID_PREVIEW_MAX = 50;
      const totalIds = deleted.cascadedCategoryIds.length;
      const previewIds = deleted.cascadedCategoryIds.slice(0, AUDIT_ID_PREVIEW_MAX);
      console.info("[DELETE /api/categories/:id] cascade removed", {
        categoryId: deleted.id,
        parentId: deleted.parentId,
        removedSortOrder: deleted.removedSortOrder,
        cascadedCategoryCount: totalIds,
        cascadedCategoryIdsPreview: previewIds,
        cascadedCategoryIdsTruncated: totalIds > AUDIT_ID_PREVIEW_MAX,
        cascadedContentLinkCount: deleted.cascadedContentLinkCount,
        cascadedProductModelCount: deleted.cascadedProductModelCount,
        cascadedProductModelLinkCount: deleted.cascadedProductModelLinkCount,
        reorderedSiblingCount: deleted.reorderedSiblingCount,
      });
    }

    return NextResponse.json({
      data: {
        id: deleted.id,
        cascadedCategoryCount: deleted.cascadedCategoryIds.length,
        cascadedContentCount: deleted.cascadedContentLinkCount,
      },
    });
  } catch (error) {
    if (error instanceof MaxDescendantsExceededError) {
      console.warn("[DELETE /api/categories/:id] MAX_DESCENDANTS 초과");
      return NextResponse.json(
        { error: "Too many descendants to delete in a single request" },
        { status: 422 },
      );
    }
    if (error instanceof CategoryError && error.kind === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
