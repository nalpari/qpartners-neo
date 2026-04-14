import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { interfaceLogQuerySchema } from "@/lib/schemas/interface-log";

// GET /api/tests/interface-log — 인터페이스 로그 목록 조회 (관리자 전용)
export async function GET(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;
    const query = interfaceLogQuerySchema.safeParse(
      Object.fromEntries(searchParams.entries()),
    );

    if (!query.success) {
      return NextResponse.json(
        { error: "パラメータが正しくありません" },
        { status: 400 },
      );
    }

    const { system, apiName, resultCode, from, to, page, limit } = query.data;

    const where = {
      ...(system && { system }),
      ...(apiName && { apiName }),
      ...(resultCode && { resultCode }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.qpInterfaceLog.findMany({
        where,
        select: {
          id: true,
          traceId: true,
          system: true,
          direction: true,
          apiName: true,
          method: true,
          requestUrl: true,
          responseStatus: true,
          resultCode: true,
          durationMs: true,
          callerRoute: true,
          userId: true,
          userType: true,
          errorMessage: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.qpInterfaceLog.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[GET /api/tests/interface-log]", error);
    return NextResponse.json(
      { error: "ログの取得に失敗しました" },
      { status: 500 },
    );
  }
}
