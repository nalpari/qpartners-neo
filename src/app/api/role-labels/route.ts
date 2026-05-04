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
//
// 캐시:
// - 준정적 데이터(4개 고정 역할). 권한관리 mutation 시 클라이언트가 ["role-labels"] invalidate.
// - 서버측 캐시는 짧은 s-maxage + stale-while-revalidate 로 폴링 부하 완화 (CDN/Edge 활용 시).
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

/** AUTH_ROLE_TO_TARGET 의 키가 실제로 매핑 정의되어 있는지 검증 (런타임 가드) */
function lookupTargetType(
  roleCode: string,
): (typeof AUTH_ROLE_TO_TARGET)[keyof typeof AUTH_ROLE_TO_TARGET] | undefined {
  if (!Object.prototype.hasOwnProperty.call(AUTH_ROLE_TO_TARGET, roleCode)) {
    return undefined;
  }
  return AUTH_ROLE_TO_TARGET[roleCode as keyof typeof AUTH_ROLE_TO_TARGET];
}

export async function GET() {
  try {
    const targetRoleCodes = Object.keys(AUTH_ROLE_TO_TARGET);

    const roles = await prisma.qpRole.findMany({
      where: { roleCode: { in: targetRoleCodes } },
      select: { roleCode: true, roleName: true, isActive: true },
      orderBy: { roleCode: "asc" },
    });

    // DB 결과와 AUTH_ROLE_TO_TARGET 매핑을 런타임 검증.
    // where 절로 이미 필터되지만, AUTH_ROLE_TO_TARGET 변경 / DB roleCode 비정상 케이스에서
    // targetType 이 undefined 로 응답되는 사고 방지 — `as` 단언 제거 + 명시적 필터.
    const data = roles.flatMap((r) => {
      const targetType = lookupTargetType(r.roleCode);
      if (!targetType) {
        console.warn(
          `[GET /api/role-labels] AUTH_ROLE_TO_TARGET 미매핑 roleCode 무시: ${r.roleCode}`,
        );
        return [];
      }
      return [
        {
          roleCode: r.roleCode,
          roleName: r.roleName,
          isActive: r.isActive,
          targetType,
        },
      ];
    });

    return NextResponse.json({ data }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("[GET /api/role-labels]", error);
    return NextResponse.json(
      { error: "権限ラベルの取得に失敗しました" },
      { status: 500 },
    );
  }
}
