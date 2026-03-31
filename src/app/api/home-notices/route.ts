import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHomeNoticeSchema } from "@/lib/schemas/home-notice";

/** status 동적 산출 (DB 컬럼 없음) */
function computeStatus(startAt: Date, endAt: Date): string {
  const now = new Date();
  if (now < startAt) return "scheduled";
  if (now > endAt) return "ended";
  return "active";
}

/** target Boolean 필드를 배열로 변환 */
function toTargetArray(row: {
  targetSuperAdmin: boolean;
  targetAdmin: boolean;
  targetFirstDealer: boolean;
  targetSecondDealer: boolean;
  targetConstructor: boolean;
  targetGeneral: boolean;
}): string[] {
  const targets: string[] = [];
  if (row.targetSuperAdmin) targets.push("super_admin");
  if (row.targetAdmin) targets.push("admin");
  if (row.targetFirstDealer) targets.push("first_dealer");
  if (row.targetSecondDealer) targets.push("second_dealer");
  if (row.targetConstructor) targets.push("constructor");
  if (row.targetGeneral) targets.push("general");
  return targets;
}

// GET /api/home-notices — 공지 목록 (관리자용)
export async function GET(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword") ?? undefined;
    const statusFilter = searchParams.get("status") ?? undefined;
    const targetType = searchParams.get("targetType") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;

    // targetType → 해당 boolean 필드 필터
    const targetMap: Record<string, string> = {
      super_admin: "targetSuperAdmin",
      admin: "targetAdmin",
      first_dealer: "targetFirstDealer",
      second_dealer: "targetSecondDealer",
      constructor: "targetConstructor",
      general: "targetGeneral",
    };
    const targetField = targetType ? targetMap[targetType] : undefined;

    // status 필터 → DB where 조건으로 변환 (메모리 필터 대신 DB 레벨)
    const now = new Date();
    const statusSet = statusFilter
      ? new Set(statusFilter.split(",").map((s) => s.trim()))
      : null;

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

    const notices = await prisma.homeNotice.findMany({
      where: {
        ...(keyword && { content: { contains: keyword } }),
        ...(targetField && { [targetField]: true }),
        ...((startDate || endDate) && {
          createdAt: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(`${endDate}T23:59:59.999Z`) }),
          },
        }),
        ...statusWhere,
      },
      orderBy: { createdAt: "desc" },
    });

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

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[GET /api/home-notices]", error);
    return NextResponse.json(
      { error: "Failed to fetch home notices" },
      { status: 500 },
    );
  }
}

// POST /api/home-notices — 공지 등록
export async function POST(request: NextRequest) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createHomeNoticeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 활성(scheduled + active) 공지 5개 초과 체크 + 등록을 트랜잭션으로 처리
    const notice = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const activeCount = await tx.homeNotice.count({
        where: { endAt: { gte: now } },
      });

      if (activeCount >= 5) {
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
    });

    return NextResponse.json({ data: notice }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LIMIT_EXCEEDED") {
      return NextResponse.json(
        { error: "활성(예정 포함) 공지가 5개를 초과할 수 없습니다" },
        { status: 400 },
      );
    }
    console.error("[POST /api/home-notices]", error);
    return NextResponse.json(
      { error: "Failed to create home notice" },
      { status: 500 },
    );
  }
}
