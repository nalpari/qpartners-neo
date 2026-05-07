import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// GET /api/role-labels — 콘텐츠/홈공지/대량메일 게시대상 권한 라벨 목록.
//
// 정책 (Target Dynamic from Role 후):
// - 미인증(비회원 포함) 모든 클라이언트 접근 가능 (middleware PUBLIC_GET_PATTERNS).
// - qp_roles 동적 조회 — 6 기본 권한 + 운영자 정의 추가 권한 모두 반환.
// - isActive=Y/N 모두 응답 (이미 비활성된 권한이 게시대상에 잔존하는 콘텐츠의 표시 라벨용).
//   신규 등록 옵션 노출은 클라이언트가 isActive=Y 만 필터링 (useTargetLabels).
// - 비회원(roleCode IS NULL) 은 권한관리 외부 sentinel — 클라이언트가 별도 고정 라벨로 처리.
//
// 캐시:
// - 권한관리 mutation 시 클라이언트가 ["role-labels"] invalidate.
// - HTTP 캐시 X (no-store) — 권한명 변경 후 화면 mount 즉시 반영 보장.
const CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export async function GET() {
  try {
    const roles = await prisma.qpRole.findMany({
      select: {
        roleCode: true,
        roleName: true,
        isActive: true,
        isSystem: true,
      },
      orderBy: [{ isSystem: "desc" }, { roleCode: "asc" }],
    });

    return NextResponse.json({ data: roles }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("[GET /api/role-labels]", error);
    return NextResponse.json(
      { error: "権限ラベルの取得に失敗しました" },
      { status: 500 },
    );
  }
}
