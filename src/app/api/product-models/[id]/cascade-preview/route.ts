import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/product-model";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/product-models/:id/cascade-preview — 삭제 확인 다이얼로그용 미리보기.
 *
 * 목업 03 은 삭제 직전에 「この型番には N 件の資料が紐づいています」 를 보여준다
 * (`03-admin-models.html:443` `modelLinkCount`). 그 N 을 사전에 얻는 경로가 필요하다 —
 * DELETE 응답의 `linkedContentCount` 는 이미 지워진 뒤라 경고에 쓸 수 없다.
 *
 * 카테고리의 `cascade-preview` 와 같은 규약이다: `delete` 권한 가드, read-only,
 * `previewedAt` 으로 preview↔DELETE 사이 TOCTOU 갭을 가시화한다. 자손 개념이 없어
 * BFS 는 없고 링크 수만 센다.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PRODUCT_MODEL", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const target = await prisma.productModel.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const contentLinkCount = await prisma.contentProductModel.count({
      where: { productModelId: parsed.data },
    });

    return NextResponse.json({
      data: {
        id: parsed.data,
        contentLinkCount,
        previewedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logError("GET /api/product-models/:id/cascade-preview", error);
    return NextResponse.json(
      { error: "Failed to load cascade preview" },
      { status: 500 },
    );
  }
}
