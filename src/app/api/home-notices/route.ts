import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import { resolveUserName } from "@/lib/admin-name";
import { requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createHomeNoticeSchema,
  computeStatus,
  toTargetArray,
} from "@/lib/schemas/home-notice";

// GET /api/home-notices — 공지 목록 (ADM_NOTICE.read 매트릭스 기반)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "read");
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword") ?? undefined;
    const statusFilter = searchParams.get("status") ?? undefined;
    const targetType = searchParams.get("targetType") ?? undefined;
    const createdBy = searchParams.get("createdBy") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));

    // targetType → 해당 boolean 필드 필터.
    // comma-separated 멀티 선택 (`first_store,seko`) 지원 — OR 조건으로 변환.
    // 단일 값도 동일 경로로 처리.
    type TargetField =
      | "targetSuperAdmin"
      | "targetAdmin"
      | "targetFirstStore"
      | "targetSecondStore"
      | "targetConstructor"
      | "targetGeneral";

    const targetMap: Record<string, TargetField> = {
      super_admin: "targetSuperAdmin",
      admin: "targetAdmin",
      first_store: "targetFirstStore",
      second_store: "targetSecondStore",
      seko: "targetConstructor",
      general: "targetGeneral",
    };

    const targetFields: TargetField[] = [];
    if (targetType) {
      const requested = targetType
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      // dedupe + 화이트리스트 검증 — 한 항목이라도 미정의 키면 400.
      const seen = new Set<string>();
      for (const key of requested) {
        const field = targetMap[key];
        if (!field) {
          return NextResponse.json(
            { error: "送信先フィルタの値が正しくありません" },
            { status: 400 },
          );
        }
        if (seen.has(key)) continue;
        seen.add(key);
        targetFields.push(field);
      }
    }

    // status 필터 → DB where 조건으로 변환 (메모리 필터 대신 DB 레벨)
    const now = new Date();
    const VALID_STATUSES = new Set(["scheduled", "active", "ended"]);
    const statusSet = statusFilter
      ? new Set(statusFilter.split(",").map((s) => s.trim()))
      : null;

    if (statusSet) {
      for (const s of statusSet) {
        if (!VALID_STATUSES.has(s)) {
          return NextResponse.json(
            { error: "ステータスの値が正しくありません" },
            { status: 400 },
          );
        }
      }
    }

    const statusWhere = statusSet
      ? {
          OR: [
            ...(statusSet.has("scheduled") ? [{ startAt: { gt: now } }] : []),
            ...(statusSet.has("active")
              ? [{ startAt: { lte: now }, endAt: { gte: now } }]
              : []),
            ...(statusSet.has("ended") ? [{ endAt: { lt: now } }] : []),
          ],
        }
      : undefined;

    // 게시대상 멀티 선택 — 선택된 boolean 컬럼들 중 하나라도 true 면 매칭(OR).
    const targetWhere =
      targetFields.length > 0
        ? { OR: targetFields.map((f) => ({ [f]: true })) }
        : undefined;

    // 날짜 파라미터 검증
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: "日付の形式が正しくありません" }, { status: 400 });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "日付の形式が正しくありません" }, { status: 400 });
    }

    // statusWhere · targetWhere 둘 다 최상위 OR 을 사용하므로 단순 spread 시 키 충돌이 발생.
    // AND 배열로 묶어 두 그룹을 동시에 적용 (상태 OR ∧ 대상 OR).
    const andClauses: Prisma.HomeNoticeWhereInput[] = [];
    if (statusWhere) andClauses.push(statusWhere);
    if (targetWhere) andClauses.push(targetWhere);

    const where = {
      // 검색 keyword 는 content 부분 일치.
      ...(keyword && { content: { contains: keyword } }),
      ...(createdBy && { createdBy: { contains: createdBy } }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(`${endDate}T23:59:59.999+09:00`) }),
        },
      }),
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    };

    const [notices, total] = await Promise.all([
      prisma.homeNotice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.homeNotice.count({ where }),
    ]);

    // QSP 사용자 이름 일괄 조회 — 행 N건의 createdBy/updatedBy 에서 unique (userType, userId) 만 추출해
    // 외부 API 호출 횟수를 최소화한다 (페이지 내 동일 등록자 다수 등장 시 1회로 축소).
    // 실패는 silent — 이름 미해결 시 프론트가 userId 로 폴백한다.
    const logTag = "[GET /api/home-notices]";
    type NameKey = string; // `${userType}:${userId}`
    const buildKey = (ut: string, uid: string): NameKey => `${ut}:${uid}`;
    const uniqueRefs = new Map<NameKey, { userType: string; userId: string }>();
    for (const n of notices) {
      // notice 의 userType 은 작성자(creator) 의 사용자 타입.
      // updatedBy 는 작성자와 다른 타입의 사용자일 수 있으나, list 응답에 별도 컬럼이 없어
      // contents API 와 동일하게 작성자 userType 으로 lookup 시도 — 실패 시 null 폴백 (resolveUserName 자체가 흡수).
      if (n.createdBy) uniqueRefs.set(buildKey(n.userType, n.createdBy), { userType: n.userType, userId: n.createdBy });
      if (n.updatedBy) uniqueRefs.set(buildKey(n.userType, n.updatedBy), { userType: n.userType, userId: n.updatedBy });
    }

    const refsArray = Array.from(uniqueRefs.entries());
    const settled = await Promise.allSettled(
      refsArray.map(([, ref]) => resolveUserName(ref.userType, ref.userId, logTag)),
    );
    const nameMap = new Map<NameKey, string | null>();
    refsArray.forEach(([key], idx) => {
      const r = settled[idx];
      nameMap.set(key, r.status === "fulfilled" ? r.value : null);
    });

    const data = notices.map((n) => ({
      id: n.id,
      targets: toTargetArray(n),
      title: n.title,
      content: n.content,
      url: n.url,
      startAt: n.startAt,
      endAt: n.endAt,
      status: computeStatus(n.startAt, n.endAt),
      userType: n.userType,
      userId: n.userId,
      createdAt: n.createdAt,
      createdBy: n.createdBy,
      createdByName: n.createdBy ? (nameMap.get(buildKey(n.userType, n.createdBy)) ?? null) : null,
      updatedAt: n.updatedAt,
      updatedBy: n.updatedBy,
      updatedByName: n.updatedBy ? (nameMap.get(buildKey(n.userType, n.updatedBy)) ?? null) : null,
    }));

    return NextResponse.json({
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("[GET /api/home-notices]", error);
    return NextResponse.json(
      { error: "お知らせ一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/home-notices — 공지 등록 (ADM_NOTICE.create 매트릭스 기반)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "create");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn("[POST /api/home-notices] Request body 파싱 실패:", parseError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = createHomeNoticeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 게시기간 겹치는 공지 5개 초과 체크 + 등록을 트랜잭션으로 처리
    const notice = await prisma.$transaction(
      async (tx) => {
        const overlapCount = await tx.homeNotice.count({
          where: {
            startAt: { lte: result.data.endAt },
            endAt: { gte: result.data.startAt },
          },
        });

        if (overlapCount >= 5) {
          throw new Error("LIMIT_EXCEEDED");
        }

        return tx.homeNotice.create({
          data: {
            ...result.data,
            userType: auth.user.userType,
            userId: auth.user.userId,
            createdBy: auth.user.userId,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    console.info("[POST /api/home-notices] created", {
      id: notice.id,
      by: auth.user.userId,
      role: auth.user.role,
    });

    return NextResponse.json({ data: notice }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LIMIT_EXCEEDED") {
      return NextResponse.json(
        { error: "同一期間に掲載できるお知らせは5件までです", code: "LIMIT_EXCEEDED" },
        { status: 400 },
      );
    }
    console.error("[POST /api/home-notices]", error);
    return NextResponse.json(
      { error: "お知らせの登録に失敗しました" },
      { status: 500 },
    );
  }
}
