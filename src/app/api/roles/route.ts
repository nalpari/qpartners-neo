import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import {
  getUserFromHeaders,
  invalidateActiveRoleCache,
  requireMenuPermission,
  resolveMenuPermission,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLE_CODES } from "@/lib/schemas/common";
import { createRoleSchema } from "@/lib/schemas/permission";

// GET /api/roles — 권한 목록
//   · activeOnly=true (회원수정 팝업 드롭다운): ADM_PERMISSION.read OR ADM_MEMBER.update 허용.
//     "회원관리만 가능한 신규 권한" 운영 시 드롭다운이 빈 옵션으로 노출되던 회귀 방지(PR #130 리뷰).
//   · activeOnly=false (권한관리 화면 전체 목록): ADM_PERMISSION.read 단독 가드.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const permRead = await resolveMenuPermission(user, "ADM_PERMISSION");
    let allowed = permRead.canRead;
    if (!allowed && activeOnly) {
      const memberUpdate = await resolveMenuPermission(user, "ADM_MEMBER");
      allowed = memberUpdate.canUpdate;
    }
    if (!allowed) {
      console.warn(
        `[GET /api/roles] 권한 거부 — role=${user.role}, activeOnly=${activeOnly}`,
      );
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const roles = await prisma.qpRole.findMany({
      where: {
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { roleCode: "asc" },
    });

    return NextResponse.json({ data: roles });
  } catch (error) {
    console.error("[GET /api/roles]", error);
    return NextResponse.json(
      { error: "権限一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/roles — 권한 추가 (ADM_PERMISSION.create — SUPER_ADMIN 전용, ADMIN 은 403)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/roles] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = createRoleSchema.safeParse(body);

    if (!result.success) {
      // 첫 위반 메시지를 그대로 노출 — 사용자가 어떤 필드의 어떤 규칙을 위반했는지 즉시 인지.
      // roleCode 형식 위반 케이스별 메시지가 그대로 전달됨 (Redmine #2165).
      // issues 는 message+path 만 노출 — `received`/`expected`/`code` 등 내부 스키마 구조 정보 차단.
      const firstMessage = result.error.issues[0]?.message ?? "入力値が不正です";
      return NextResponse.json(
        {
          error: firstMessage,
          issues: result.error.issues.map((i) => ({ message: i.message, path: i.path })),
        },
        { status: 400 },
      );
    }

    // 6 기본 권한 코드 충돌 차단 (예약 코드)
    if (SYSTEM_ROLE_CODES.has(result.data.roleCode)) {
      console.warn(
        `[POST /api/roles] 시스템 예약 권한 코드 충돌 시도 차단: ${result.data.roleCode}`,
      );
      return NextResponse.json(
        { error: "予約された権限コードは使用できません", roleCode: result.data.roleCode },
        { status: 400 },
      );
    }

    // isSystem 은 운영자 input 무시 — 서버에서 false 강제 (추가 권한은 시스템 권한 X)
    const role = await prisma.qpRole.create({
      data: { ...result.data, isSystem: false },
    });

    // 신규 권한 추가 시 활성 권한 캐시 무효화
    invalidateActiveRoleCache();

    return NextResponse.json({ data: role }, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "既に存在するroleCodeです" },
        { status: 409 },
      );
    }
    console.error("[POST /api/roles]", error);
    return NextResponse.json(
      { error: "権限の作成に失敗しました" },
      { status: 500 },
    );
  }
}
