import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { resolveUserName } from "@/lib/admin-name";
import { canModifyResource, isInternalUser, resolveAuthorSuperAdmin, requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  idParamSchema,
  updateHomeNoticeSchema,
  computeStatus,
  toTargetArray,
} from "@/lib/schemas/home-notice";

type Params = { params: Promise<{ id: string }> };

// 트랜잭션 내부에서 단일 catch 분기로 매핑하기 위한 도메인 에러.
// throw 문자열 매칭 대신 instanceof 로 분기 → 메시지 변경/번역에 영향받지 않음.
class HomeNoticeUpdateError extends Error {
  constructor(
    public readonly kind: "NOT_FOUND" | "FORBIDDEN" | "LIMIT_EXCEEDED" | "INVALID_RANGE",
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
      const [superAdminSettled, createdNameSettled, updatedNameSettled] = await Promise.allSettled([
        resolveAuthorSuperAdmin({ userType: notice.userType, userId: notice.userId }),
        resolveUserName(notice.userType, createdById, logTag),
        notice.updatedBy && !sameUser
          ? resolveUserName(notice.userType, notice.updatedBy, logTag)
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
    const notice = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.homeNotice.findUnique({
          where: { id: parsed.data },
          select: { startAt: true, endAt: true, userType: true, userId: true },
        });

        if (!existing) throw new HomeNoticeUpdateError("NOT_FOUND");

        // SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인.
        // canModifyResource 는 author SUPER_ADMIN 판정용 admin role 조회를 prisma 글로벌로 수행 — 다른 테이블 참조 데이터이므로 tx 외부 세션 사용도 정합성에 영향 없음.
        if (!(await canModifyResource(auth.user, existing))) {
          throw new HomeNoticeUpdateError("FORBIDDEN");
        }

        const finalStartAt = result.data.startAt ?? existing.startAt;
        const finalEndAt = result.data.endAt ?? existing.endAt;

        if (finalStartAt >= finalEndAt) {
          // schema refine 은 양쪽이 다 전달된 경우만 검사 — 한쪽만 보낸 케이스는 여기서 cross-validation.
          throw new HomeNoticeUpdateError("INVALID_RANGE");
        }

        // 게시기간이 실제로 변경된 경우에만 5건 한도 재검사.
        // 이유:
        //   POST(create) 는 "신규 공지 자신의 기간" 만 검사하므로 긴 기간을 가진 기존 공지
        //   안에 다른 공지가 누적되어 자신 기준 5건 초과 상태가 만들어질 수 있음. 이때
        //   날짜 변경 없이 content/대상/URL 만 수정하는 것까지 막히는 UX 결함이 생김.
        //   날짜를 그대로 두는 수정은 새로운 겹침 관계를 만들지 않으므로 한도 검사 불필요.
        //   날짜가 바뀌는 경우에만 새 기간 기준으로 다시 검사 (period shift / expand / shrink).
        const datesUnchanged =
          finalStartAt.getTime() === existing.startAt.getTime() &&
          finalEndAt.getTime() === existing.endAt.getTime();

        if (!datesUnchanged) {
          const overlapCount = await tx.homeNotice.count({
            where: {
              id: { not: parsed.data },
              startAt: { lte: finalEndAt },
              endAt: { gte: finalStartAt },
            },
          });

          if (overlapCount >= 5) {
            throw new HomeNoticeUpdateError("LIMIT_EXCEEDED");
          }
        }

        return tx.homeNotice.update({
          where: { id: parsed.data },
          data: { ...result.data, updatedBy: auth.user.userId },
        });
      },
      { isolationLevel: "Serializable" },
    );

    // 감사 로그 — PII 없음(ID/role 만). 운영 추적용.
    console.info("[PUT /api/home-notices/:id] updated", {
      id: notice.id,
      by: auth.user.userId,
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
        // FE 가 message 문자열이 아닌 code 로 분기할 수 있도록 식별자 동봉.
        return NextResponse.json(
          { error: "同一期間に掲載できるお知らせは5件までです", code: "LIMIT_EXCEEDED" },
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
      by: auth.user.userId,
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
