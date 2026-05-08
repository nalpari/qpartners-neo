import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders } from "@/lib/auth";
import { jstDayStart, jstNextDayStart } from "@/lib/jst-day";
import { prisma } from "@/lib/prisma";

// GET /api/home-notices/active — 홈화면용 활성 공지
//
// 정책 (2026-05-08): 그룹 공유 정책 전면 제거. 권한관리 매트릭스(게시대상 = roleCode)를
// 단일 진실 원천으로 사용한다. SUPER_ADMIN 의 ADMIN 양방, STORE 의 1ST/2ND 그룹 공유 모두
// 폐지 — 사용자 권한과 정확히 일치하는 게시대상만 노출.
//
// - 비로그인: `GENERAL` 게시대상 노출 (비회원에게 일반회원 대상 공지 노출은 의도된 동작)
// - 로그인: `[userRole]` 자기 권한 게시대상만 (1:1 매칭)
export async function GET(request: NextRequest) {
  try {
    // 게시기간 day 단위 비교 — JST 기준 오늘/내일 자정.
    // startAt 이 오늘 중 어떤 시각이든 통과시키려면 `< tomorrowStart` 비교 (Redmine #2131).
    const todayStart = jstDayStart();
    const tomorrowStart = jstNextDayStart();

    const user = getUserFromHeaders(request.headers);
    const userRole = user?.role ?? null;

    // 사용자 권한 → 매칭할 roleCode 목록 (1:1 매칭)
    const matchRoleCodes: string[] = userRole ? [userRole] : ["GENERAL"];

    const notices = await prisma.homeNotice.findMany({
      where: {
        // day 단위 비교 — startAt 이 오늘 어떤 시각이든 통과 (< tomorrowStart).
        // endAt 이 오늘 자정 이상이면 오늘 종일 노출 (Redmine #2131).
        startAt: { lt: tomorrowStart },
        endAt: { gte: todayStart },
        targets: { some: { roleCode: { in: matchRoleCodes } } },
      },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        startAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ data: notices });
  } catch (error) {
    console.error("[GET /api/home-notices/active]", error);
    return NextResponse.json(
      { error: "お知らせの取得に失敗しました。" },
      { status: 500 },
    );
  }
}
