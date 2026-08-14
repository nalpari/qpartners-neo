import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

import { getUserFromHeaders, isInternalUser, requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCategorySchema } from "@/lib/schemas/category";

import { CategoryError } from "./_constants";

// GET /api/categories — 카테고리 트리 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const internalOnly = searchParams.get("internalOnly") === "true";
    const activeOnly = searchParams.get("activeOnly") !== "false";

    // 비활성 항목 포함 조회 시 ADM_CATEGORY.read 매트릭스 필요 (관리자 메뉴 전용)
    if (!activeOnly) {
      const auth = await requireMenuPermission(request.headers, "ADM_CATEGORY", "read");
      if (auth instanceof NextResponse) return auth;
    }

    // 사내전용 카테고리 서버측 차단.
    //
    // 이 라우트는 middleware PUBLIC_GET_PATTERNS 에 등록돼 비로그인 GET 이 가능하다.
    // 화면단 필터(콘텐츠 검색/상세/등록 폼/목록 그리드)만으로는 API 직접 호출을 막지 못해
    // 사내전용 분류의 이름과 트리 구조가 그대로 새어 나간다 → 응답 단계에서 제외한다.
    //
    // 판정 기준은 요청자의 역할(isInternalUser) 하나뿐이다. activeOnly 는 활성 상태 필터일 뿐
    // 권한 신호가 아니므로 여기에 얹지 않는다 — resolveMenuPermission 은 역할 유형을 가리지 않고
    // 매트릭스만 조회하므로, 비사내 역할에 ADM_CATEGORY.read 가 부여되면 activeOnly=false 만으로
    // 사내전용 트리가 열리게 된다 (최소 권한 원칙 위배).
    const user = getUserFromHeaders(request.headers);
    const internal = user ? isInternalUser(user.role) : false;

    // internalOnly(관리자 「社内専用のみ表示」 필터) 와 동시 적용 시 차단이 우선한다 —
    // 비사내 사용자가 internalOnly=true 로 요청하면 결과 0건이 정답.
    const internalOnlyFilter = !internal
      ? { isInternalOnly: false }
      : internalOnly
        ? { isInternalOnly: true }
        : {};

    // isVisible 은 "콘텐츠 목록 ag-grid 의 카테고리 컬럼 노출" 토글 전용 정책.
    // API 응답에서 isVisible=false 부모를 제거하면 콘텐츠 목록의 검색 체크박스·콘텐츠 상세·
    // 등록 폼의 카테고리 선택 등 다른 모든 화면에서도 동시에 사라지는 회귀가 발생.
    // 따라서 서버측 필터는 활성/내부전용 만 적용하고, isVisible 적용은 호출지(ag-grid)에서
    // 클라이언트 필터로 수행한다 (contents-table.tsx 의 columnDefs 생성부).
    const categories = await prisma.category.findMany({
      where: {
        parentId: null,
        ...(activeOnly && { isActive: true }),
        ...internalOnlyFilter,
      },
      include: {
        children: {
          // 부모가 일반(N)이어도 사내전용 자식은 개별로 존재할 수 있으므로 자식에도 동일 적용.
          where: {
            ...(activeOnly && { isActive: true }),
            ...internalOnlyFilter,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error("[GET /api/categories]", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

// POST /api/categories — 카테고리 등록 (ADM_CATEGORY.create 매트릭스 기반)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_CATEGORY", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createCategorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // isVisible 은 1Depth 전용 정책 — 자식 카테고리(parentId !== null) 에 false 가 전송되면
    // 서버 단에서 명시적으로 거절(PUT 핸들러와 동일 정책). createCategorySchema 의 default(true) 가
    // 적용되어 true 값은 자식에 와도 기능 영향이 없으므로 false 케이스만 차단.
    if (result.data.parentId !== null && result.data.isVisible === false) {
      return NextResponse.json(
        { error: "isVisible は 1Depth カテゴリ専用です" },
        { status: 400 },
      );
    }

    let shiftLog: {
      parentId: number | null;
      insertAt: number;
      shiftedCount: number;
    } | null = null;

    const category = await prisma.$transaction(
      async (tx) => {
        // 2Depth 제한: parent의 parentId가 not null이면 3Depth → 거부.
        // 같은 조회로 부모의 사내전용 여부도 함께 확인한다 (쿼리 추가 없음).
        let isInternalOnly = result.data.isInternalOnly;
        if (result.data.parentId !== null) {
          const parent = await tx.category.findUnique({
            where: { id: result.data.parentId },
            select: { parentId: true, isInternalOnly: true },
          });

          if (!parent) {
            throw new CategoryError("PARENT_NOT_FOUND");
          }

          if (parent.parentId !== null) {
            throw new CategoryError("DEPTH_EXCEEDED");
          }

          // 부모(1Depth)가 사내전용이면 자식도 사내전용으로 고정한다.
          // 화면에서는 라디오가 잠기지만, API 직접 호출로 Y 부모 밑에 N 자식이 생기는 경로가
          // 남아 있어 서버에서도 막는다. 400 거절이 아니라 승격으로 처리 — PUT 의 하위 전파와
          // 같은 방향이라 "자식 ≥ 부모" 불변식이 두 라우트에서 동일하게 유지된다.
          if (parent.isInternalOnly && !isInternalOnly) {
            console.info(
              "[POST /api/categories] 부모가 사내전용 — isInternalOnly 를 Y 로 강제",
              { parentId: result.data.parentId },
            );
            isInternalOnly = true;
          }
        }

        // 먼저 기존 형제를 밀어낸 뒤 새 카테고리를 삽입 (순서 중요)
        const shifted = await tx.category.updateMany({
          where: {
            parentId: result.data.parentId,
            sortOrder: { gte: result.data.sortOrder },
          },
          data: { sortOrder: { increment: 1 } },
        });
        shiftLog = {
          parentId: result.data.parentId,
          insertAt: result.data.sortOrder,
          shiftedCount: shifted.count,
        };

        return tx.category.create({ data: { ...result.data, isInternalOnly } });
      },
      { isolationLevel: "Serializable" },
    );

    if (shiftLog) {
      console.log("[POST /api/categories] sortOrder 재정렬", shiftLog);
    }

    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    if (error instanceof CategoryError) {
      if (error.kind === "PARENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "상위 카테고리가 존재하지 않습니다" },
          { status: 404 },
        );
      }
      if (error.kind === "DEPTH_EXCEEDED") {
        return NextResponse.json(
          { error: "2Depth까지만 등록 가능합니다" },
          { status: 400 },
        );
      }
    }
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 존재하는 categoryCode입니다" },
        { status: 409 },
      );
    }
    console.error("[POST /api/categories]", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
}
