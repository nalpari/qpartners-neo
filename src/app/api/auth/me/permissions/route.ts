import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders, resolveMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { menuCodeSchema } from "@/lib/schemas/common";

/**
 * GET /api/auth/me/permissions — 현재 로그인 사용자의 메뉴별 권한 목록
 *
 * - 인증 필요 (미인증 → 401). middleware 에서 JWT 검증 후 X-User-* 헤더 주입됨.
 * - `authRole` ↔ `roleCode` 1:1 매핑 (메모리 §4) — X-User-Role 을 roleCode 로 그대로 사용.
 * - 권한 판정은 `resolveMenuPermission` 공용 헬퍼로 위임 — `requireMenuPermission` 가드와
 *   동일 정책 보장 (FE/BE divergence 원천 차단). SUPER_ADMIN 은 DB 조회 스킵(fail-open),
 *   시드 미등록/비활성 메뉴는 해석 시 전부 false 로 수렴(fail-closed).
 * - 시드 외 menuCode 가 DB 에 존재하면 응답에서 제외 (MenuCode 리터럴 유니온 검증 실패 시).
 * - 응답 캐싱: `private, no-store` — 권한 회수 즉시성 확보 (SUPER_ADMIN 이 PUT /roles/../permissions 로
 *   권한을 회수해도 브라우저/중간 캐시가 옛 응답을 보관하면 UI 에는 보이는데 서버는 403 하는 UX 가 발생.
 *   권한 1회 조회 비용은 인덱스 포함 JOIN 1건(수 ms)으로 무시 가능).
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const activeMenus = await prisma.menu.findMany({
      where: { isActive: true },
      select: { menuCode: true },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    });

    const resolved = await Promise.all(
      activeMenus.map(async (m) => {
        const parsed = menuCodeSchema.safeParse(m.menuCode);
        if (!parsed.success) {
          console.warn(
            `[GET /api/auth/me/permissions] 시드 외 menuCode 응답 제외: ${m.menuCode}`,
          );
          return null;
        }
        const perm = await resolveMenuPermission(user, parsed.data);
        return { menuCode: parsed.data, ...perm };
      }),
    );

    const menus = resolved.filter(
      (m): m is NonNullable<typeof m> => m !== null,
    );

    const response = NextResponse.json({
      data: { roleCode: user.role, menus },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[GET /api/auth/me/permissions]", error);
    return NextResponse.json(
      { error: "権限の取得に失敗しました" },
      { status: 500 },
    );
  }
}
