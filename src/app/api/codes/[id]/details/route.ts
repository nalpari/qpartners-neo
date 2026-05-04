import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  createCodeDetailSchema,
  idParamSchema,
  validateSecAuthValidityCode,
} from "@/lib/schemas/code";
import { invalidateUserTypeLabelCache } from "@/lib/user-type-labels";

type Params = { params: Promise<{ id: string }> };

// GET /api/codes/:id/details — Detail 목록 (CODES.read — ADMIN 포함 매트릭스 허용)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "read");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      console.warn("[GET /api/codes/:id/details] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }

    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
    });

    if (!header) {
      return NextResponse.json({ error: "ヘッダーコードが見つかりません" }, { status: 404 });
    }

    // 보조 정렬: id asc — 동일 sortOrder 가 둘 이상일 때 결정적 순서 보장
    // (관리자가 신규 행 추가 시 기존 행과 sortOrder 충돌해도 등록순으로 안정 정렬).
    const details = await prisma.codeDetail.findMany({
      where: {
        headerId: parsed.data,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({ data: details });
  } catch (error) {
    logError("GET /api/codes/:id/details", error);
    return NextResponse.json(
      { error: "コード詳細の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/codes/:id/details — Detail 등록 (CODES.create — SUPER_ADMIN 전용, ADMIN 은 403)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CODE", "create");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      console.warn("[POST /api/codes/:id/details] ヘッダーID 파싱 실패:", id);
      return NextResponse.json({ error: "ヘッダーIDの形式が正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/codes/:id/details] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディの形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = createCodeDetailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力値が正しくありません", issues: result.error.issues },
        { status: 400 },
      );
    }

    const header = await prisma.codeHeader.findUnique({
      where: { id: parsed.data },
    });

    if (!header) {
      return NextResponse.json({ error: "ヘッダーコードが見つかりません" }, { status: 404 });
    }

    // SEC_AUTH_VALIDITY 헤더에 한해 1~90 정수 상하한 가드 (Boston 리뷰 HIGH #2)
    const validity = validateSecAuthValidityCode(header.headerCode, result.data.code);
    if (!validity.ok) {
      return NextResponse.json({ error: validity.message }, { status: 400 });
    }

    // 자동 정렬: 신규 행의 sortOrder 와 같거나 큰 기존 행을 모두 +1 밀어 자리 확보.
    // 예) 기존 [A:1, B:2, C:3] 에 sortOrder=2 신규 추가 → B/C 가 3/4 로 이동, NEW 는 2.
    // 트랜잭션으로 count + shift + create 를 원자적으로 처리해 동시 등록 시 중간상태 노출 차단.
    //
    // sortOrder 클램프: [1, count+1] 범위로 강제. 사용자가 1561 같은 큰 숫자나 0/음수 입력 시
    // 자동으로 마지막 자리(count+1) 또는 첫 자리(1)로 보정 — 운영자 실수 방지.
    const detail = await prisma.$transaction(async (tx) => {
      const currentCount = await tx.codeDetail.count({
        where: { headerId: parsed.data },
      });
      const maxSort = currentCount + 1;
      const clampedSort = Math.max(1, Math.min(result.data.sortOrder, maxSort));

      await tx.codeDetail.updateMany({
        where: {
          headerId: parsed.data,
          sortOrder: { gte: clampedSort },
        },
        data: { sortOrder: { increment: 1 } },
      });
      return tx.codeDetail.create({
        data: {
          ...result.data,
          sortOrder: clampedSort,
          headerId: parsed.data,
        },
      });
    });

    if (header.headerCode === "USER_TYPE") {
      invalidateUserTypeLabelCache();
    }

    return NextResponse.json({ data: detail }, { status: 201 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "このヘッダー内で既に存在するコードです" },
          { status: 409 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "ヘッダーコードが見つかりません" },
          { status: 404 },
        );
      }
    }
    logError("POST /api/codes/:id/details", error);
    return NextResponse.json(
      { error: "コード詳細の作成に失敗しました" },
      { status: 500 },
    );
  }
}
