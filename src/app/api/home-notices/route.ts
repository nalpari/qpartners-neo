import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createHomeNoticeSchema,
  computeStatus,
  toTargetArray,
} from "@/lib/schemas/home-notice";

// GET /api/home-notices — 공지 목록 (ADM_NOTICE.read 매트릭스 기반)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "read");
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword") ?? undefined;
    const statusFilter = searchParams.get("status") ?? undefined;
    const targetType = searchParams.get("targetType") ?? undefined;
    const createdBy = searchParams.get("createdBy") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));

    // targetType → 해당 boolean 필드 필터
    const targetMap: Record<string, string> = {
      super_admin: "targetSuperAdmin",
      admin: "targetAdmin",
      first_store: "targetFirstStore",
      second_store: "targetSecondStore",
      seko: "targetConstructor",
      general: "targetGeneral",
    };

    if (targetType && !targetMap[targetType]) {
      return NextResponse.json(
        { error: "送信先フィルタの値が正しくありません" },
        { status: 400 },
      );
    }
    const targetField = targetType ? targetMap[targetType] : undefined;

    // status 필터 → DB where 조건으로 변환 (메모리 필터 대신 DB 레벨)
    const now = new Date();
    const VALID_STATUSES = new Set(["scheduled", "active", "ended"]);
    const statusSet = statusFilter
      ? new Set(statusFilter.split(",").map((s) => s.trim()))
      : null;

    if (statusSet) {
      for (const s of statusSet) {
        if (!VALID_STATUSES.has(s)) {
          return NextResponse.json(
            { error: "ステータスの値が正しくありません" },
            { status: 400 },
          );
        }
      }
    }

    const statusWhere = statusSet
      ? {
          OR: [
            ...(statusSet.has("scheduled") ? [{ startAt: { gt: now } }] : []),
            ...(statusSet.has("active")
              ? [{ startAt: { lte: now }, endAt: { gte: now } }]
              : []),
            ...(statusSet.has("ended") ? [{ endAt: { lt: now } }] : []),
          ],
        }
      : undefined;

    // 날짜 파라미터 검증
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: "日付の形式が正しくありません" }, { status: 400 });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "日付の形式が正しくありません" }, { status: 400 });
    }

    const where = {
      ...(keyword && { content: { contains: keyword } }),
      ...(createdBy && { createdBy: { contains: createdBy } }),
      ...(targetField && { [targetField]: true }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(`${endDate}T23:59:59.999+09:00`) }),
        },
      }),
      ...statusWhere,
    };

    const [notices, total] = await Promise.all([
      prisma.homeNotice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.homeNotice.count({ where }),
    ]);

    const data = notices.map((n) => ({
      id: n.id,
      targets: toTargetArray(n),
      content: n.content,
      url: n.url,
      startAt: n.startAt,
      endAt: n.endAt,
      status: computeStatus(n.startAt, n.endAt),
      userType: n.userType,
      userId: n.userId,
      createdAt: n.createdAt,
      createdBy: n.createdBy,
      updatedAt: n.updatedAt,
      updatedBy: n.updatedBy,
    }));

    return NextResponse.json({
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("[GET /api/home-notices]", error);
    return NextResponse.json(
      { error: "お知らせ一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/home-notices — 공지 등록 (ADM_NOTICE.create 매트릭스 기반)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = createHomeNoticeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 게시기간 겹치는 공지 5개 초과 체크 + 등록을 트랜잭션으로 처리
    const notice = await prisma.$transaction(
      async (tx) => {
        const overlapCount = await tx.homeNotice.count({
          where: {
            startAt: { lte: result.data.endAt },
            endAt: { gte: result.data.startAt },
          },
        });

        if (overlapCount >= 5) {
          throw new Error("LIMIT_EXCEEDED");
        }

        return tx.homeNotice.create({
          data: {
            ...result.data,
            userType: auth.user.userType,
            userId: auth.user.userId,
            createdBy: auth.user.userId,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json({ data: notice }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LIMIT_EXCEEDED") {
      return NextResponse.json(
        { error: "同一期間に掲載できるお知らせは5件までです" },
        { status: 400 },
      );
    }
    console.error("[POST /api/home-notices]", error);
    return NextResponse.json(
      { error: "お知らせの登録に失敗しました" },
      { status: 500 },
    );
  }
}
