import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { resolveUserName, resolveUserNameUnknownType } from "@/lib/admin-name";
import { canModifyResource, isInternalUser, resolveAuthorSuperAdmin, requireMenuPermission } from "@/lib/auth";
import { maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import {
  idParamSchema,
  updateHomeNoticeSchema,
  computeStatus,
  toTargetArray,
  TARGET_FIELD_TO_KEY,
  type TargetField,
} from "@/lib/schemas/home-notice";

type Params = { params: Promise<{ id: string }> };

// 트랜잭션 내부에서 단일 catch 분기로 매핑하기 위한 도메인 에러.
// throw 문자열 매칭 대신 instanceof 로 분기 → 메시지 변경/번역에 영향받지 않음.
// LIMIT_EXCEEDED 의 경우 어느 target 그룹이 한도 초과인지 식별하기 위해 target 동봉.
class HomeNoticeUpdateError extends Error {
  constructor(
    public readonly kind: "NOT_FOUND" | "FORBIDDEN" | "LIMIT_EXCEEDED" | "INVALID_RANGE",
    public readonly target?: TargetField,
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
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    const notice = await prisma.homeNotice.findUnique({
      where: { id: parsed.data },
    });

    if (!notice) {
      return NextResponse.json(
        { error: "お知らせが見つかりません" },
        { status: 404 },
      );
    }

    // 프론트 수정/삭제 버튼 노출 판단용 + 등록자/갱신자 이름 조회.
    // - resolveAuthorSuperAdmin: ADMIN 수정 버튼 숨김 (내부 fail-closed)
    // - resolveUserName: QSP 외부 호출 — 실패 시 null → 프론트가 userId 로 폴백
    // 사내 사용자에게만 제공 (일반 사용자에게 admin 메타 노출 방지).
    const internal = isInternalUser(auth.user.role);
    const logTag = "[GET /api/home-notices/:id]";

    let authorIsSuperAdmin: boolean | undefined;
    let createdByName: string | null | undefined;
    let updatedByName: string | null | undefined;
    if (internal) {
      const createdById = notice.createdBy ?? notice.userId;
      const sameUser = notice.updatedBy && notice.updatedBy === createdById;
      // updatedBy 가 createdBy 와 다른 사람(다른 userType 가능)인 경우 notice.userType 으로
      // QSP 조회하면 잘못된 결과가 반환되거나 null 폴백이 빈번. 후보 userType 순차 시도.
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
      targets: toTargetArray(notice),
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

    console.log(`[GET /api/home-notices/:id] 공지 단건 조회 — id: ${notice.id}`);

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error("[GET /api/home-notices/:id] 공지 단건 조회 실패:", error);
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

    // 존재 확인 → 권한 검증 → 한도 검증 → 갱신을 모두 동일 트랜잭션(Serializable) 안에서 수행해
    // findUnique 와 update 사이의 TOCTOU 윈도우(작성자/소유자가 다른 세션에서 변경되는 경우)를 닫음.
    const TARGET_FIELDS = Object.keys(TARGET_FIELD_TO_KEY) as TargetField[];

    const notice = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.homeNotice.findUnique({
          where: { id: parsed.data },
          select: {
            startAt: true,
            endAt: true,
            userType: true,
            userId: true,
            targetSuperAdmin: true,
            targetAdmin: true,
            targetFirstStore: true,
            targetSecondStore: true,
            targetConstructor: true,
            targetGeneral: true,
          },
        });

        if (!existing) throw new HomeNoticeUpdateError("NOT_FOUND");

        // SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인.
        // tx 전달 → admin role 조회까지 동일 트랜잭션 스냅샷에서 평가, 권한 판정과 update 사이의 정합성 강화.
        if (!(await canModifyResource(auth.user, existing, tx))) {
          throw new HomeNoticeUpdateError("FORBIDDEN");
        }

        const finalStartAt = result.data.startAt ?? existing.startAt;
        const finalEndAt = result.data.endAt ?? existing.endAt;

        if (finalStartAt > finalEndAt) {
          // schema refine 은 양쪽이 다 전달된 경우만 검사 — 한쪽만 보낸 케이스는 여기서 cross-validation.
          // Issue #2176 (2) — 시작일==종료일 허용 (`>=` → `>`).
          throw new HomeNoticeUpdateError("INVALID_RANGE");
        }

        // 권한별(target별) 5건 한도 재검사.
        //   - dates 변경 시: 모든 final true 인 target 그룹에 대해 새 기간 기준으로 재검사
        //   - dates 동일 + 새로 추가된 target 만: 추가된 target 그룹만 검사
        //     (false → true 로 합류하는 그룹은 새 카운트에 추가되므로 한도 확인 필요)
        //   - dates 동일 + target 그대로 또는 제거만: 검사 불필요
        //     (이미 자기 포함 5건 이하인 그룹에서 자기를 빼고 다시 넣어도 동일 카운트)
        const datesUnchanged =
          finalStartAt.getTime() === existing.startAt.getTime() &&
          finalEndAt.getTime() === existing.endAt.getTime();

        const finalTargets: Record<TargetField, boolean> = {
          targetSuperAdmin:
            result.data.targetSuperAdmin ?? existing.targetSuperAdmin,
          targetAdmin: result.data.targetAdmin ?? existing.targetAdmin,
          targetFirstStore:
            result.data.targetFirstStore ?? existing.targetFirstStore,
          targetSecondStore:
            result.data.targetSecondStore ?? existing.targetSecondStore,
          targetConstructor:
            result.data.targetConstructor ?? existing.targetConstructor,
          targetGeneral: result.data.targetGeneral ?? existing.targetGeneral,
        };

        const targetsToCheck: TargetField[] = [];
        for (const f of TARGET_FIELDS) {
          if (!finalTargets[f]) continue;
          const newlyAdded = !existing[f] && finalTargets[f];
          if (!datesUnchanged || newlyAdded) targetsToCheck.push(f);
        }

        for (const f of targetsToCheck) {
          const c = await tx.homeNotice.count({
            where: {
              id: { not: parsed.data },
              startAt: { lte: finalEndAt },
              endAt: { gte: finalStartAt },
              [f]: true,
            },
          });
          if (c >= 5) throw new HomeNoticeUpdateError("LIMIT_EXCEEDED", f);
        }

        return tx.homeNotice.update({
          where: { id: parsed.data },
          data: { ...result.data, updatedBy: auth.user.userId },
        });
      },
      { isolationLevel: "Serializable" },
    );

    // 감사 로그 — auth.user.userId 가 STORE/SEKO/GENERAL 의 경우 이메일 형태 가능.
    // maskEmail 통과시켜 PII 누출 방지(이메일 아니면 원본 유지).
    console.info("[PUT /api/home-notices/:id] updated", {
      id: notice.id,
      by: maskEmail(auth.user.userId),
      role: auth.user.role,
    });

    return NextResponse.json({ data: notice });
  } catch (error) {
    if (error instanceof HomeNoticeUpdateError) {
      if (error.kind === "NOT_FOUND") {
        return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
      }
      if (error.kind === "FORBIDDEN") {
        return NextResponse.json({ error: "修正する権限がありません" }, { status: 403 });
      }
      if (error.kind === "LIMIT_EXCEEDED") {
        // FE 가 message 문자열이 아닌 code 로 분기할 수 있도록 식별자 동봉 + 어느
        // target 그룹이 초과인지 안내용으로 외부 키(toTargetArray 와 동일) 정규화.
        const target = error.target ? TARGET_FIELD_TO_KEY[error.target] : undefined;
        return NextResponse.json(
          {
            error: "同一期間に同じ送信先で掲載できるお知らせは5件までです",
            code: "LIMIT_EXCEEDED",
            ...(target ? { target } : {}),
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

    await prisma.homeNotice.delete({ where: { id: parsed.data } });

    console.info("[DELETE /api/home-notices/:id] deleted", {
      id: parsed.data,
      by: maskEmail(auth.user.userId),
      role: auth.user.role,
    });

    return NextResponse.json({ data: { id: parsed.data } });
  } catch (error) {
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
