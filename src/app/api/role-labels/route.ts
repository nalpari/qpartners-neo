import { NextResponse } from "next/server";

import { AUTH_ROLE_TO_TARGET } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/role-labels — 콘텐츠 게시대상에 매핑된 권한코드/권한명/사용가능여부 목록.
//
// 정책:
// - 미인증(비회원 포함) 모든 클라이언트 접근 가능 (middleware PUBLIC_GET_PATTERNS).
// - `AUTH_ROLE_TO_TARGET` 에 정의된 4개 roleCode (1ST_STORE / 2ND_STORE / SEKO / GENERAL) 만
//   `targetType` 매핑과 함께 응답. 비회원(`non_member`)은 권한관리 대상이 아니므로
//   클라이언트에서 별도 고정 라벨로 처리한다.
// - 응답에는 `isActive` 그대로 포함 — 등록/검색 옵션 노출은 클라이언트가 isActive=Y 만 필터링.
//   (이미 비활성된 권한이 게시대상에 잔존하는 기존 콘텐츠는 표시용 라벨이 필요하므로 데이터는 모두 반환.)
export async function GET() {
  try {
    const targetRoleCodes = Object.keys(AUTH_ROLE_TO_TARGET);

    const roles = await prisma.qpRole.findMany({
      where: { roleCode: { in: targetRoleCodes } },
      select: { roleCode: true, roleName: true, isActive: true },
      orderBy: { roleCode: "asc" },
    });

    const data = roles.map((r) => ({
      roleCode: r.roleCode,
      roleName: r.roleName,
      isActive: r.isActive,
      targetType:
        AUTH_ROLE_TO_TARGET[r.roleCode as keyof typeof AUTH_ROLE_TO_TARGET],
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[GET /api/role-labels]", error);
    return NextResponse.json(
      { error: "権限ラベルの取得に失敗しました" },
      { status: 500 },
    );
  }
}
