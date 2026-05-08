import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/home-notices/active — 홈화면용 활성 공지
//
// 정책 (Target Dynamic from Role 후):
// - HomeNoticeTarget 정규화 테이블 기반 — qp_roles.roleCode 매칭.
// - 사용자 권한별 노출 정책:
//   · SUPER_ADMIN: SUPER_ADMIN + ADMIN 양쪽 게시대상 노출 (사내 양방)
//   · ADMIN: ADMIN 게시대상만
//   · STORE 양 권한(1ST_STORE/2ND_STORE): 양쪽 게시대상 노출 (운영 정책 — 판매점 그룹 공지 공유)
//   · SEKO/GENERAL/추가 권한: 자기 권한 게시대상만
//   · 비로그인: GENERAL 게시대상 노출 (기존 동작 유지)
export async function GET(request: NextRequest) {
  try {
    const now = new Date();

    // 게시기간 date-only 비교용 — JST 기준 "오늘 자정"(UTC ms).
    // 등록 시 FE 가 startAt/endAt 을 그 날 자정으로 저장하므로, day 단위 비교로 통일해야
    // "노출기간 D~D" 공지가 그 날 종일 노출됨 (Redmine #2131).
    // 운영 TZ(JST) 기준 명시 — 서버 컨테이너 TZ 의존성 제거.
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const todayStart = new Date(
      Math.floor((now.getTime() + JST_OFFSET_MS) / ONE_DAY_MS) * ONE_DAY_MS - JST_OFFSET_MS,
    );

    const user = getUserFromHeaders(request.headers);
    const userRole = user?.role ?? null;

    // 사용자 권한 → 매칭할 roleCode 목록
    const matchRoleCodes: string[] = (() => {
      // 비로그인 → GENERAL 공지 노출 (기존 동작 유지).
      // ContentTarget 의 비회원 sentinel(roleCode=null) 과는 도메인 정책이 다름:
      // 홈공지는 비로그인자에게 일반회원 대상 공지를 노출하는 것이 의도된 운영 정책.
      if (!userRole) return ["GENERAL"];
      if (userRole === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN"];
      if (userRole === "ADMIN") return ["ADMIN"];
      if (userRole === "1ST_STORE" || userRole === "2ND_STORE") {
        return ["1ST_STORE", "2ND_STORE"];
      }
      // SEKO / GENERAL / 운영자 정의 추가 권한 → 자기 권한 게시대상만
      return [userRole];
    })();

    const notices = await prisma.homeNotice.findMany({
      where: {
        // day 단위 비교 — endAt(JST D일 자정) 이 todayStart(JST 오늘 자정) 이상이면 오늘 종일 노출.
        // timestamp(now) 비교 시 D~D 공지가 자정 직후만 통과되던 결함 차단 (Redmine #2131).
        startAt: { lte: todayStart },
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
