import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import {
  canAccessContent,
  canModifyResource,
  getUserFromHeaders,
  isInternalUser,
  requireMenuPermission,
  resolveAuthorSuperAdmin,
} from "@/lib/auth";
import { buildCategoryTree, CATEGORY_TREE_INCLUDE } from "@/lib/category-tree";
import { ensureAuthorTarget } from "@/lib/contents-author-target";
import {
  reconcileInlineImages,
  unlinkInlineImages,
} from "@/lib/inline-image-cleanup";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { resolveUserName } from "@/lib/admin-name";
import { FIVE_DAYS_MS } from "@/lib/schemas/common";
import { idParamSchema, updateContentSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

// GET /api/contents/:id — 콘텐츠 상세 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 접근제어를 위해 먼저 조회
    const existing = await prisma.content.findUnique({
      where: { id: parsed.data },
      include: { targets: { select: { roleCode: true, startAt: true, endAt: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 삭제된 콘텐츠는 사내 사용자만 조회 가능
    const internal = user ? isInternalUser(user.role) : false;
    if (existing.status === "deleted" && !internal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 게시대상/기간 접근제어
    if (!canAccessContent(user, existing.targets)) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
    }

    // viewCount 증가: published 상태이고 사내 사용자가 아닌 경우만 (봇/프리패치 방어)
    const shouldIncrement =
      existing.status === "published" && !internal;

    const content = await prisma.content.update({
      where: { id: parsed.data },
      data: shouldIncrement ? { viewCount: { increment: 1 } } : {},
      include: {
        targets: { select: { id: true, roleCode: true, startAt: true, endAt: true } },
        categories: {
          include: { category: CATEGORY_TREE_INCLUDE },
        },
        attachments: {
          select: { id: true, fileName: true, fileSize: true, mimeType: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const now = Date.now();

    // 프론트 수정/삭제 버튼 노출 판단용 — 사내 사용자에게만 제공 (일반 사용자에게 admin 메타데이터 노출 방지)
    // resolveAuthorSuperAdmin 은 내부에서 에러를 흡수하고 status=unknown + fail-closed(true) 로 수렴
    // 담당자 이름(createdByName/updatedByName)은 사내 사용자 관리정보 영역 표시용 — 외부 노출 방지.
    // content.userType 을 명시 전달 (requireAdmin 전제 변경에 대비한 방어적 설계).
    // QSP 장애 시 null → 프론트에서 userId 로 폴백.
    //
    // 아키텍처 노트:
    // - Promise.allSettled: DB(resolveAuthorSuperAdmin) vs 외부 QSP(resolveUserName) 실패 도메인이 다름.
    //   하나가 throw 해도 나머지 결과를 보존 — GET 전체 500 방지
    // - QSP dedup: createdBy === updatedBy 인 일반 케이스에서 외부 HTTP 10s 호출을 1회로 축소
    const logTag = "[GET /api/contents/:id]";
    let authorIsSuperAdmin: boolean | undefined;
    let createdByName: string | null | undefined;
    let updatedByName: string | null | undefined;
    if (internal) {
      const createdById = content.createdBy ?? content.userId;
      const sameUser = content.updatedBy && content.updatedBy === createdById;
      const [superAdminSettled, createdNameSettled, updatedNameSettled] = await Promise.allSettled([
        resolveAuthorSuperAdmin({ userType: content.userType, userId: content.userId }),
        resolveUserName(content.userType, createdById, logTag),
        content.updatedBy && !sameUser
          ? resolveUserName(content.userType, content.updatedBy, logTag)
          : Promise.resolve<string | null>(null),
      ]);
      authorIsSuperAdmin =
        superAdminSettled.status === "fulfilled" ? superAdminSettled.value.isSuperAdmin : undefined;
      createdByName = createdNameSettled.status === "fulfilled" ? createdNameSettled.value : null;
      // createdBy === updatedBy 면 조회 결과 재사용
      if (!content.updatedBy) {
        updatedByName = null;
      } else if (sameUser) {
        updatedByName = createdByName;
      } else {
        updatedByName = updatedNameSettled.status === "fulfilled" ? updatedNameSettled.value : null;
      }
    }

    // 갱신 이력 판별을 서버에서 단일 출처로 계산 (클라이언트 Date 비교 중복 제거).
    // DB precision 한계로 updatedAt===createdAt 가 초 단위에서 동일할 수 있으나
    // 비교 로직을 클라이언트 여러 곳에서 반복하면 드리프트 위험 → 서버 한 군데로 집중.
    const hasBeenUpdated = content.updatedAt.getTime() !== content.createdAt.getTime();

    return NextResponse.json({
      data: {
        ...content,
        authorIsSuperAdmin,
        createdByName,
        updatedByName,
        hasBeenUpdated,
        isNew: now - content.createdAt.getTime() < FIVE_DAYS_MS,
        isUpdated: now - content.updatedAt.getTime() < FIVE_DAYS_MS,
        categories: buildCategoryTree(content.categories, { includeInternal: internal }),
        attachments: content.attachments.map((a) => ({
          ...a,
          fileSize: a.fileSize !== null ? Number(a.fileSize) : null,
        })),
      },
    });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logError("GET /api/contents/:id", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 },
    );
  }
}

// PUT /api/contents/:id — 콘텐츠 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "CONTENT", "update");
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 권한 세분화: SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
    const existing = await prisma.content.findUnique({
      where: { id: parsed.data },
      select: { userType: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!(await canModifyResource(user, existing))) {
      return NextResponse.json(
        { error: "修正する権限がありません" },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (jsonError: unknown) {
      console.warn("[PUT /api/contents/:id] Request body 파싱 실패:", jsonError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = updateContentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    const { targets, categoryIds, ...contentData } = result.data;

    // 비사내 작성자의 본인 권한 강제 포함 — FE 우회 방어 (정책: lib/contents-author-target.ts).
    // targets 미명시(undefined) 시 변경 의도 없음으로 기존 보존, 명시된 경우만 보강.
    const effectiveTargets = ensureAuthorTarget(targets, user.role);

    const { content, unlinkPaths } = await prisma.$transaction(async (tx) => {
      if (effectiveTargets) {
        await tx.contentTarget.deleteMany({
          where: { contentId: parsed.data },
        });
      }

      if (categoryIds) {
        await tx.contentCategory.deleteMany({
          where: { contentId: parsed.data },
        });
      }

      const updated = await tx.content.update({
        where: { id: parsed.data },
        data: {
          ...contentData,
          updatedBy: user.userId,
          targets: effectiveTargets ? { create: effectiveTargets } : undefined,
          categories: categoryIds
            ? {
                create: categoryIds.map((categoryId) => ({
                  categoryId,
                  createdBy: user.userId,
                })),
              }
            : undefined,
        },
        include: {
          targets: { select: { id: true, roleCode: true, startAt: true, endAt: true } },
          categories: { include: { category: CATEGORY_TREE_INCLUDE } },
        },
      });

      // body 가 patch 본에 없으면(부분 수정) 본문이 그대로 — cleanup 생략하여 본문 이미지 누락 방지.
      // body=null/""(삭제 의도)인 경우는 reconcile 에 그대로 전달 → 모든 inline image 삭제.
      // 미포함 케이스는 cron sweep 도입 전이라 임시 행이 누적될 수 있어 운영 추적용 warn.
      let inlineResult: { unlinkPaths: string[] } = { unlinkPaths: [] };
      if (contentData.body !== undefined) {
        inlineResult = await reconcileInlineImages({
          kind: "update",
          tx,
          contentId: parsed.data,
          body: contentData.body ?? null,
          user: { userType: user.userType, userId: user.userId },
        });
      } else {
        console.warn(
          "[PUT /api/contents/:id] body 미포함 patch — inline image reconcile 생략",
          { contentId: parsed.data },
        );
      }

      return { content: updated, unlinkPaths: inlineResult.unlinkPaths };
    });

    await unlinkInlineImages(unlinkPaths, "[PUT /api/contents/:id]");

    // PUT 응답의 includeInternal은 요청자 역할에 따라 동적으로 판단.
    // 매트릭스가 외부 역할에 update 권한을 부여하더라도 내부 카테고리 노출을 방지.
    return NextResponse.json({
      data: {
        ...content,
        categories: buildCategoryTree(content.categories, { includeInternal: isInternalUser(user.role) }),
      },
    });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logError("PUT /api/contents/:id", error);
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 },
    );
  }
}

// DELETE /api/contents/:id — 콘텐츠 삭제 (soft delete)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "CONTENT", "delete");
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 권한 세분화: SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
    const existing = await prisma.content.findUnique({
      where: { id: parsed.data },
      select: { userType: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!(await canModifyResource(user, existing))) {
      return NextResponse.json(
        { error: "削除する権限がありません" },
        { status: 403 },
      );
    }

    await prisma.content.update({
      where: { id: parsed.data },
      data: { status: "deleted", updatedBy: user.userId },
    });

    return NextResponse.json({
      data: { id: parsed.data, status: "deleted" },
    });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logError("DELETE /api/contents/:id", error);
    return NextResponse.json(
      { error: "Failed to delete content" },
      { status: 500 },
    );
  }
}
