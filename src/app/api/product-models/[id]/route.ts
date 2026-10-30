import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { PRODUCT_MODEL_CATEGORY_SELECT } from "@/lib/product-model";
import { idParamSchema, updateProductModelSchema } from "@/lib/schemas/product-model";

import { assertProductCategory, DUPLICATE_MODEL_RESPONSE } from "../_shared";

type Params = { params: Promise<{ id: string }> };

/** PUT /api/product-models/:id — 형번 수정 (ADM_PRODUCT_MODEL.update) */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PRODUCT_MODEL", "update");
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn("[PUT /api/product-models/:id] Request body 파싱 실패:", parseError);
      return NextResponse.json({ error: "リクエスト形式が正しくありません" }, { status: 400 });
    }

    const result = updateProductModelSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (result.data.categoryId !== undefined) {
      const categoryError = await assertProductCategory(result.data.categoryId);
      if (categoryError) return categoryError;
    }

    const updated = await prisma.productModel.update({
      where: { id: parsed.data },
      data: { ...result.data, updatedBy: user.userId },
      include: { category: PRODUCT_MODEL_CATEGORY_SELECT },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      // 카테고리 이동·형번명 변경으로 `(category_id, model_code)` UNIQUE 와 충돌
      if (error.code === "P2002") {
        return NextResponse.json(DUPLICATE_MODEL_RESPONSE, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    logError("PUT /api/product-models/:id", error);
    return NextResponse.json({ error: "型番の修正に失敗しました" }, { status: 500 });
  }
}

/**
 * DELETE /api/product-models/:id — 형번 삭제 (ADM_PRODUCT_MODEL.delete).
 *
 * 콘텐츠-형번 연결(`qp_content_product_models`)은 FK `onDelete: Cascade` 로 함께 지워진다.
 * 콘텐츠 본체는 남는다. DB 엔진의 cascade 는 로그에 보이지 않으므로, 몇 건의 연결이
 * 끊어지는지 삭제 전에 세어 감사 로그로 남긴다.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PRODUCT_MODEL", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const linkedContentCount = await tx.contentProductModel.count({
        where: { productModelId: parsed.data },
      });
      await tx.productModel.delete({ where: { id: parsed.data } });
      return { id: parsed.data, linkedContentCount };
    });

    if (deleted.linkedContentCount > 0) {
      console.info("[DELETE /api/product-models/:id] cascade removed", deleted);
    }

    return NextResponse.json({ data: deleted });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logError("DELETE /api/product-models/:id", error);
    return NextResponse.json({ error: "型番の削除に失敗しました" }, { status: 500 });
  }
}
