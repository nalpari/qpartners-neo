import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  idParamSchema,
  updateCodeDetailSchema,
  validateSecAuthValidityCode,
} from "@/lib/schemas/code";
import { invalidateUserTypeLabelCache } from "@/lib/user-type-labels";

type Params = { params: Promise<{ id: string; detailId: string }> };

// PUT /api/codes/:id/details/:detailId — Detail 수정 (CODES.update — SUPER_ADMIN 전용, ADMIN 은 403)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "update");
    if (auth instanceof NextResponse) return auth;

    const { id, detailId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      console.warn("[PUT /api/codes/:id/details/:detailId] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }
    const parsedDetailId = idParamSchema.safeParse(detailId);
    if (!parsedDetailId.success) {
      console.warn("[PUT /api/codes/:id/details/:detailId] 詳細ID 파싱 실패:", detailId);
      return NextResponse.json({ error: "詳細IDの形式が正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/codes/:id/details/:detailId] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディの形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = updateCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が正しくありません", issues: result.error.issues },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 },
      );
    }

    // 헤더 정보를 1회만 조회해 SEC_AUTH_VALIDITY 검증 + USER_TYPE 캐시 무효화 양쪽에 재사용.
    // 기존 구현은 PUT 처리 중 최대 2회 codeHeader.findUnique 가 발생했음 — DB 왕복 절감.
    const header = await prisma.codeHeader.findUnique({
      where: { id: parsedId.data },
      select: { headerCode: true },
    });
    if (!header) {
      return NextResponse.json(
        { error: "ヘッダーコードが見つかりません" },
        { status: 404 },
      );
    }

    // SEC_AUTH_VALIDITY 헤더에 한해 1~90 정수 상하한 가드 (Boston 리뷰 HIGH #2).
    if (result.data.code !== undefined) {
      const validity = validateSecAuthValidityCode(header.headerCode, result.data.code);
      if (!validity.ok) {
        return NextResponse.json({ error: validity.message }, { status: 400 });
      }
    }

    const detail = await prisma.codeDetail.update({
      where: { id: parsedDetailId.data, headerId: parsedId.data },
      data: result.data,
    });

    // USER_TYPE 헤더 디테일 변경 시 라벨 캐시 무효화 (코드/codeName/isActive 즉시 반영).
    if (header.headerCode === "USER_TYPE") {
      invalidateUserTypeLabelCache();
    }

    return NextResponse.json({ data: detail });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "このヘッダー内で既に存在するコードです" },
          { status: 409 },
        );
      }
    }
    logError("PUT /api/codes/:id/details/:detailId", error);
    return NextResponse.json(
      { error: "コード詳細の更新に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/codes/:id/details/:detailId — Detail 물리 삭제 (CODES.delete — SUPER_ADMIN 전용, ADMIN 은 403)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id, detailId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      console.warn("[DELETE /api/codes/:id/details/:detailId] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }
    const parsedDetailId = idParamSchema.safeParse(detailId);
    if (!parsedDetailId.success) {
      console.warn("[DELETE /api/codes/:id/details/:detailId] 詳細ID 파싱 실패:", detailId);
      return NextResponse.json({ error: "詳細IDの形式が正しくありません" }, { status: 400 });
    }

    // 감사 로그 — 물리 삭제는 복구가 어려우므로 관리자 user id와 대상 ID 기록
    console.info(
      `[DELETE /api/codes/:id/details/:detailId] userId=${auth.user.userId} headerId=${parsedId.data} detailId=${parsedDetailId.data}`,
    );

    // 삭제 전 헤더 정보 확보 — 삭제 직후 라벨 캐시 무효화 결정에 사용.
    const headerForCache = await prisma.codeHeader.findUnique({
      where: { id: parsedId.data },
      select: { headerCode: true },
    });

    await prisma.codeDetail.delete({
      where: { id: parsedDetailId.data, headerId: parsedId.data },
    });

    if (headerForCache?.headerCode === "USER_TYPE") {
      invalidateUserTypeLabelCache();
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    }
    logError("DELETE /api/codes/:id/details/:detailId", error);
    return NextResponse.json(
      { error: "コード詳細の削除に失敗しました" },
      { status: 500 },
    );
  }
}
