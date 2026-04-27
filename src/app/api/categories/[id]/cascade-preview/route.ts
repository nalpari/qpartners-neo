import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/category";

import { CATEGORY_MAX_DESCENDANTS } from "../../_constants";

type Params = { params: Promise<{ id: string }> };

// GET /api/categories/:id/cascade-preview
//
// 삭제 확인 다이얼로그용 미리보기 — 실제 DELETE 와 동일한 BFS 로직으로
// 자손 카테고리 수와 영향받을 ContentCategory 링크 수를 사전 집계한다.
// 결과는 운영자에게 영향 범위(특히 콘텐츠 연결)를 명시적으로 보여주는 데 사용.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CATEGORY", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 대상 카테고리 존재 확인 (없으면 404)
    const target = await prisma.category.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // BFS 로 자손 ID 수집 — DELETE 핸들러와 동일 알고리즘.
    // 트랜잭션 미사용 — preview 는 read-only, race 가 발생해도 운영자에게 안내된 수치와
    // 실제 cascade 결과 사이의 미세한 차이는 허용 (DELETE 시점에 다시 정확히 카운트).
    const descendantIds: number[] = [];
    let frontier: number[] = [parsed.data];
    while (frontier.length > 0) {
      if (descendantIds.length >= CATEGORY_MAX_DESCENDANTS) {
        console.warn(
          "[GET /api/categories/:id/cascade-preview] MAX_DESCENDANTS 초과",
          { categoryId: parsed.data, collected: descendantIds.length },
        );
        return NextResponse.json(
          { error: "Too many descendants to preview" },
          { status: 422 },
        );
      }
      const children = await prisma.category.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      if (children.length === 0) break;
      const childIds = children.map((c) => c.id);
      descendantIds.push(...childIds);
      frontier = childIds;
    }

    const affectedCategoryIds = [parsed.data, ...descendantIds];
    const contentLinkCount = await prisma.contentCategory.count({
      where: { categoryId: { in: affectedCategoryIds } },
    });

    return NextResponse.json({
      data: {
        id: parsed.data,
        descendantCount: descendantIds.length,
        contentLinkCount,
      },
    });
  } catch (error) {
    console.error("[GET /api/categories/:id/cascade-preview]", error);
    return NextResponse.json(
      { error: "Failed to load cascade preview" },
      { status: 500 },
    );
  }
}
