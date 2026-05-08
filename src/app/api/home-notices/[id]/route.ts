import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { resolveUserName, resolveUserNameUnknownType } from "@/lib/admin-name";
import { canModifyResource, isInternalUser, resolveActiveRoleCodes, resolveAuthorSuperAdmin, requireMenuPermission } from "@/lib/auth";
import { maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import {
  idParamSchema,
  updateHomeNoticeSchema,
  computeStatus,
} from "@/lib/schemas/home-notice";

type Params = { params: Promise<{ id: string }> };

class HomeNoticeUpdateError extends Error {
  constructor(
    public readonly kind: "NOT_FOUND" | "FORBIDDEN" | "LIMIT_EXCEEDED" | "INVALID_RANGE",
    public readonly target?: string,
  ) {
    super(kind);
    this.name = "HomeNoticeUpdateError";
  }
}

// GET /api/home-notices/:id — 공지 단건 조회 (ADM_NOTICE.read 매트릭스 기반)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "read");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });
    }

    const notice = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
      include: { targets: { select: { roleCode: true } } },
    });

    if (!notice) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }

    const internal = isInternalUser(auth.user.role);
    const logTag = "[GET /api/home-notices/:id]";

    let authorIsSuperAdmin: boolean | undefined;
    let createdByName: string | null | undefined;
    let updatedByName: string | null | undefined;
    if (internal) {
      const createdById = notice.createdBy ?? notice.userId;
      const sameUser = notice.updatedBy && notice.updatedBy === createdById;
      const [superAdminSettled, createdNameSettled, updatedNameSettled] = await Promise.allSettled([
        resolveAuthorSuperAdmin({ userType: notice.userType, userId: notice.userId }),
        resolveUserName(notice.userType, createdById, logTag),
        notice.updatedBy && !sameUser
          ? resolveUserNameUnknownType(notice.updatedBy, logTag).then((r) => r.name)
          : Promise.resolve<string | null>(null),
      ]);
      authorIsSuperAdmin =
        superAdminSettled.status === "fulfilled" ? superAdminSettled.value.isSuperAdmin : undefined;
      createdByName = createdNameSettled.status === "fulfilled" ? createdNameSettled.value : null;
      if (!notice.updatedBy) {
        updatedByName = null;
      } else if (sameUser) {
        updatedByName = createdByName;
      } else {
        updatedByName = updatedNameSettled.status === "fulfilled" ? updatedNameSettled.value : null;
      }
    }

    const data = {
      id: notice.id,
      targetRoleCodes: notice.targets.map((t) => t.roleCode),
      title: notice.title,
      content: notice.content,
      url: notice.url,
      startAt: notice.startAt,
      endAt: notice.endAt,
      status: computeStatus(notice.startAt, notice.endAt),
      userType: notice.userType,
      userId: notice.userId,
      authorIsSuperAdmin,
      createdAt: notice.createdAt,
      createdBy: notice.createdBy,
      createdByName,
      updatedAt: notice.updatedAt,
      updatedBy: notice.updatedBy,
      updatedByName,
    };

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error("[GET /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "お知らせの取得に失敗しました" },
      { status: 500 },
    );
  }
}

// PUT /api/home-notices/:id — 공지 수정 (ADM_NOTICE.update 매트릭스 기반)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "update");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn("[PUT /api/home-notices/:id] Request body 파싱 실패:", parseError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = updateHomeNoticeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: result.error.issues },
        { status: 400 },
      );
    }

    // targetRoleCodes DB 활성 검증 — 비활성/미존재 권한코드 차단
    if (result.data.targetRoleCodes) {
      const activeRoles = await resolveActiveRoleCodes();
      const inactiveRoles = result.data.targetRoleCodes.filter((c) => !activeRoles.has(c));
      if (inactiveRoles.length > 0) {
        return NextResponse.json(
          { error: "無効な権限コードが含まれています", invalidRoleCodes: inactiveRoles },
          { status: 400 },
        );
      }
    }

    const notice = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.homeNotice.findUnique({
          where: { id: parsed.data },
          include: { targets: { select: { roleCode: true } } },
        });

        if (!existing) throw new HomeNoticeUpdateError("NOT_FOUND");

        if (!(await canModifyResource(auth.user, existing, tx))) {
          throw new HomeNoticeUpdateError("FORBIDDEN");
        }

        const finalStartAt = result.data.startAt ?? existing.startAt;
        const finalEndAt = result.data.endAt ?? existing.endAt;

        if (finalStartAt > finalEndAt) {
          throw new HomeNoticeUpdateError("INVALID_RANGE");
        }

        // 권한별(roleCode별) 5건 한도 재검사.
        // - dates 변경 시: 모든 final roleCode 그룹에 대해 새 기간 기준으로 재검사
        // - dates 동일 + 새로 추가된 roleCode 만: 추가된 그룹만 검사
        // - dates 동일 + roleCode 그대로 또는 제거만: 검사 불필요
        const datesUnchanged =
          finalStartAt.getTime() === existing.startAt.getTime() &&
          finalEndAt.getTime() === existing.endAt.getTime();

        const existingRoleCodes = new Set(existing.targets.map((t) => t.roleCode));
        const finalRoleCodes = result.data.targetRoleCodes
          ? new Set(result.data.targetRoleCodes)
          : existingRoleCodes;

        const codesToCheck: string[] = [];
        for (const code of finalRoleCodes) {
          const newlyAdded = !existingRoleCodes.has(code);
          if (!datesUnchanged || newlyAdded) codesToCheck.push(code);
        }

        // 권한별 5건 한도 일괄 검사 — N+1 루프 대신 단일 GROUP BY 집계 쿼리
        if (codesToCheck.length > 0) {
          const overLimit = await tx.$queryRaw<{ role_code: string }[]>`
            SELECT hnt.role_code
            FROM qp_home_notice_targets hnt
            JOIN qp_home_notices hn ON hn.id = hnt.home_notice_id
            WHERE hnt.role_code IN (${Prisma.join(codesToCheck)})
              AND hn.id <> ${parsed.data}
              AND hn.start_at <= ${finalEndAt}
              AND hn.end_at   >= ${finalStartAt}
            GROUP BY hnt.role_code
            HAVING COUNT(DISTINCT hn.id) >= 5
            LIMIT 1
          `;
          if (overLimit.length > 0) {
            throw new HomeNoticeUpdateError("LIMIT_EXCEEDED", overLimit[0].role_code);
          }
        }

        // 게시대상 갱신 — 전송된 경우에만 deleteMany + create
        const updateData: Parameters<typeof tx.homeNotice.update>[0]["data"] = {
          ...(result.data.title !== undefined && { title: result.data.title }),
          ...(result.data.content !== undefined && { content: result.data.content }),
          ...(result.data.url !== undefined && { url: result.data.url }),
          ...(result.data.startAt !== undefined && { startAt: result.data.startAt }),
          ...(result.data.endAt !== undefined && { endAt: result.data.endAt }),
          updatedBy: auth.user.userId,
          ...(result.data.targetRoleCodes && {
            targets: {
              deleteMany: {},
              create: result.data.targetRoleCodes.map((code) => ({ roleCode: code })),
            },
          }),
        };

        return tx.homeNotice.update({
          where: { id: parsed.data },
          data: updateData,
          include: { targets: { select: { roleCode: true } } },
        });
      },
      { isolationLevel: "Serializable" },
    );

    console.info("[PUT /api/home-notices/:id] updated", {
      id: notice.id,
      by: maskEmail(auth.user.userId),
      role: auth.user.role,
    });

    return NextResponse.json({
      data: {
        ...notice,
        targetRoleCodes: notice.targets.map((t) => t.roleCode),
      },
    });
  } catch (error: unknown) {
    if (error instanceof HomeNoticeUpdateError) {
      if (error.kind === "NOT_FOUND") {
        return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
      }
      if (error.kind === "FORBIDDEN") {
        return NextResponse.json({ error: "修正する権限がありません" }, { status: 403 });
      }
      if (error.kind === "LIMIT_EXCEEDED") {
        return NextResponse.json(
          {
            error: "同一期間に同じ送信先で掲載できるお知らせは5件までです",
            code: "LIMIT_EXCEEDED",
            ...(error.target ? { target: error.target } : {}),
          },
          { status: 400 },
        );
      }
      if (error.kind === "INVALID_RANGE") {
        return NextResponse.json(
          { error: "開始日は終了日より前に設定してください" },
          { status: 400 },
        );
      }
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    console.error("[PUT /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "お知らせの更新に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/home-notices/:id — 공지 삭제 (물리 삭제, ADM_NOTICE.delete 매트릭스 기반)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "delete");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });
    }

    const existing = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
      select: { userType: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }

    if (!(await canModifyResource(auth.user, existing))) {
      return NextResponse.json(
        { error: "削除する権限がありません" },
        { status: 403 },
      );
    }

    // HomeNoticeTarget 은 onDelete: Cascade 로 자동 정리
    await prisma.homeNotice.delete({ where: { id: parsed.data } });

    console.info("[DELETE /api/home-notices/:id] deleted", {
      id: parsed.data,
      by: maskEmail(auth.user.userId),
      role: auth.user.role,
    });

    return NextResponse.json({ data: { id: parsed.data } });
  } catch (error: unknown) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    console.error("[DELETE /api/home-notices/:id]", error);
    return NextResponse.json(
      { error: "お知らせの削除に失敗しました" },
      { status: 500 },
    );
  }
}
