import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  roleCodeParamSchema,
  updateRoleSchema,
} from "@/lib/schemas/permission";

type Params = { params: Promise<{ roleCode: string }> };

// PUT /api/roles/:roleCode — 권한 수정 (ADM_PERMISSION.update — SUPER_ADMIN 전용)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_PERMISSION", "update");
    if (auth instanceof NextResponse) return auth;

    const { roleCode } = await params;
    const parsedCode = roleCodeParamSchema.safeParse(roleCode);
    if (!parsedCode.success) {
      // path param 검증 실패는 단순 포맷(`{ error }`) 으로 통일 —
      // GET/permissions 등 다른 path param 검증과 응답 형태 일관성 유지.
      const firstMessage = parsedCode.error.issues[0]?.message ?? "roleCodeが不正です";
      return NextResponse.json({ error: firstMessage }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/roles/:roleCode] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストボディのJSON解析に失敗しました" },
        { status: 400 },
      );
    }

    const result = updateRoleSchema.safeParse(body);

    if (!result.success) {
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

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新対象のフィールドがありません" },
        { status: 400 },
      );
    }

    // enum 완화(authRole 6종 고정 → regex)로 인한 방어선 보완 — 명시적 존재 확인.
    // P2025(Record not found) 처리에 의존하지 않고 미존재 시 즉시 404 로 분기해
    // unique 제약/감사 로그 등 update 사이드이펙트 발생 가능성을 차단.
    const exists = await prisma.qpRole.findUnique({
      where: { roleCode: parsedCode.data },
      select: { roleCode: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: "指定された権限が見つかりません" },
        { status: 404 },
      );
    }

    const role = await prisma.qpRole.update({
      where: { roleCode: parsedCode.data },
      data: result.data,
    });

    return NextResponse.json({ data: role });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "指定された権限が見つかりません" }, { status: 404 });
    }
    console.error("[PUT /api/roles/:roleCode]", error);
    return NextResponse.json(
      { error: "権限の更新に失敗しました" },
      { status: 500 },
    );
  }
}
