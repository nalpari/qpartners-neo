import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/category";

type Params = { params: Promise<{ id: string }> };

// GET /api/tests/interface-log/:id — 인터페이스 로그 상세 조회 (관리자 전용)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const log = await prisma.qpInterfaceLog.findUnique({
      where: { id: parsed.data },
    });

    if (!log) {
      return NextResponse.json({ error: "ログが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ data: log });
  } catch (error) {
    console.error("[GET /api/tests/interface-log/:id]", error);
    return NextResponse.json(
      { error: "ログの取得に失敗しました" },
      { status: 500 },
    );
  }
}
