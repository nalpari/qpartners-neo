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
        startAt: { lte: now },
        endAt: { gte: now },
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
