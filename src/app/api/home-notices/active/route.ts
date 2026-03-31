import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/home-notices/active — 홈화면용 활성 공지
export async function GET(request: NextRequest) {
  try {
    const now = new Date();

    // 사용자 역할 확인 (비회원이면 general만)
    const user = getUserFromHeaders(request.headers);
    const userType = user?.userType ?? null;
    const userRole = user?.role ?? null;

    // 역할별 target 필터 조건
    const targetFilter = (() => {
      switch (userType) {
        case "ADMIN":
          // super_admin은 양쪽 모두, admin은 targetAdmin만
          if (userRole === "super_admin") {
            return [{ targetSuperAdmin: true }, { targetAdmin: true }];
          }
          return [{ targetAdmin: true }];
        case "DEALER":
          return [{ targetFirstDealer: true }, { targetSecondDealer: true }];
        case "SEKO":
          return [{ targetConstructor: true }];
        case "GENERAL":
          return [{ targetGeneral: true }];
        default:
          // 비회원: targetGeneral만
          return [{ targetGeneral: true }];
      }
    })();

    const notices = await prisma.homeNotice.findMany({
      where: {
        startAt: { lte: now },
        endAt: { gte: now },
        OR: targetFilter,
      },
      select: {
        id: true,
        content: true,
        url: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: notices });
  } catch (error) {
    console.error("[GET /api/home-notices/active]", error);
    return NextResponse.json(
      { error: "Failed to fetch active notices" },
      { status: 500 },
    );
  }
}
