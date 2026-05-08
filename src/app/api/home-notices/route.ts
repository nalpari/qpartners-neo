import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { resolveUserName, resolveUserNameUnknownType } from "@/lib/admin-name";
import { requireMenuPermission, resolveActiveRoleCodes } from "@/lib/auth";
import { jstDayStart, jstNextDayStart, jstParseDateOnly, jstParseDateOnlyEnd } from "@/lib/jst-day";
import { maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import {
  createHomeNoticeSchema,
  computeStatus,
} from "@/lib/schemas/home-notice";

/**
 * 트랜잭션 내부 도메인 에러 — instanceof 분기로 매핑.
 */
class HomeNoticeCreateError extends Error {
  constructor(
    public readonly kind: "LIMIT_EXCEEDED",
    public readonly target?: string,
  ) {
    super(kind);
    this.name = "HomeNoticeCreateError";
  }
}

// GET /api/home-notices — 공지 목록 (ADM_NOTICE.read 매트릭스 기반)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "read");
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword") ?? undefined;
    const statusFilter = searchParams.get("status") ?? undefined;
    // roleCode 멀티 선택 (comma-separated) — qp_roles 동적 (6 기본 + 추가 권한)
    const roleCodeParam = searchParams.get("roleCode") ?? undefined;
    const createdBy = searchParams.get("createdBy") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));

    // roleCode 검색 필터 — 형식 검증만 (활성 검증은 qp_roles 가 단일 진실 원천)
    const ROLE_CODE_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;
    const targetRoleCodes: string[] = [];
    if (roleCodeParam) {
      const requested = roleCodeParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const seen = new Set<string>();
      for (const code of requested) {
        if (!ROLE_CODE_FORMAT.test(code) || code.length > 50) {
          return NextResponse.json(
            { error: "送信先フィルタの値が正しくありません" },
            { status: 400 },
          );
        }
        if (seen.has(code)) continue;
        seen.add(code);
        targetRoleCodes.push(code);
      }
    }

    // status 필터 → DB where 조건으로 변환 — day 단위 비교 (JST 기준).
    const todayStart = jstDayStart();
    const tomorrowStart = jstNextDayStart();
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
            ...(statusSet.has("scheduled") ? [{ startAt: { gte: tomorrowStart } }] : []),
            ...(statusSet.has("active")
              ? [{ startAt: { lt: tomorrowStart }, endAt: { gte: todayStart } }]
              : []),
            ...(statusSet.has("ended") ? [{ endAt: { lt: todayStart } }] : []),
          ],
        }
      : undefined;

    // 게시대상 멀티 선택 — HomeNoticeTarget 정규화 테이블 JOIN
    const targetWhere =
      targetRoleCodes.length > 0
        ? { targets: { some: { roleCode: { in: targetRoleCodes } } } }
        : undefined;

    // 날짜 파라미터 검증 — yyyy-MM-dd 형식 강제
    const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !DATE_ONLY_RE.test(startDate)) {
      return NextResponse.json({ error: "日付はyyyy-MM-dd形式で入力してください" }, { status: 400 });
    }
    if (endDate && !DATE_ONLY_RE.test(endDate)) {
      return NextResponse.json({ error: "日付はyyyy-MM-dd形式で入力してください" }, { status: 400 });
    }

    const andClauses: Prisma.HomeNoticeWhereInput[] = [];
    if (statusWhere) andClauses.push(statusWhere);
    if (targetWhere) andClauses.push(targetWhere);

    const where: Prisma.HomeNoticeWhereInput = {
      ...(keyword && { content: { contains: keyword } }),
      ...(createdBy && { createdBy: { contains: createdBy } }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: jstParseDateOnly(startDate) }),
          ...(endDate && { lte: jstParseDateOnlyEnd(endDate) }),
        },
      }),
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    };

    const [notices, total] = await Promise.all([
      prisma.homeNotice.findMany({
        where,
        include: { targets: { select: { roleCode: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.homeNotice.count({ where }),
    ]);

    // QSP 사용자 이름 일괄 조회 (기존 로직 유지)
    const logTag = "[GET /api/home-notices]";
    type LookupKey = string;
    const knownKey = (ut: string, uid: string): LookupKey => `known:${ut}:${uid}`;
    const unknownKey = (uid: string): LookupKey => `unknown:${uid}`;

    const knownLookups = new Map<LookupKey, { userType: string; userId: string }>();
    const unknownLookups = new Map<LookupKey, string>();

    for (const n of notices) {
      if (n.createdBy) {
        knownLookups.set(knownKey(n.userType, n.createdBy), {
          userType: n.userType,
          userId: n.createdBy,
        });
      }
    }

    const knownByUserId = new Map<string, LookupKey>();
    for (const [key, ref] of knownLookups.entries()) {
      if (!knownByUserId.has(ref.userId)) knownByUserId.set(ref.userId, key);
    }

    for (const n of notices) {
      if (!n.updatedBy) continue;
      if (n.updatedBy === n.createdBy) continue;
      if (knownByUserId.has(n.updatedBy)) continue;
      unknownLookups.set(unknownKey(n.updatedBy), n.updatedBy);
    }

    const knownEntries = Array.from(knownLookups.entries());
    const unknownEntries = Array.from(unknownLookups.entries());

    const [knownSettled, unknownSettled] = await Promise.all([
      Promise.allSettled(
        knownEntries.map(([, ref]) =>
          resolveUserName(ref.userType, ref.userId, logTag),
        ),
      ),
      Promise.allSettled(
        unknownEntries.map(([, uid]) =>
          resolveUserNameUnknownType(uid, logTag).then((r) => r.name),
        ),
      ),
    ]);

    const nameMap = new Map<LookupKey, string | null>();
    knownEntries.forEach(([key], idx) => {
      const r = knownSettled[idx];
      nameMap.set(key, r.status === "fulfilled" ? r.value : null);
    });
    unknownEntries.forEach(([key], idx) => {
      const r = unknownSettled[idx];
      nameMap.set(key, r.status === "fulfilled" ? r.value : null);
    });

    const resolveCreatedByName = (n: (typeof notices)[number]): string | null =>
      n.createdBy ? (nameMap.get(knownKey(n.userType, n.createdBy)) ?? null) : null;

    const resolveUpdatedByName = (n: (typeof notices)[number]): string | null => {
      if (!n.updatedBy) return null;
      if (n.updatedBy === n.createdBy) {
        return nameMap.get(knownKey(n.userType, n.updatedBy)) ?? null;
      }
      const knownKeyForUser = knownByUserId.get(n.updatedBy);
      if (knownKeyForUser) return nameMap.get(knownKeyForUser) ?? null;
      return nameMap.get(unknownKey(n.updatedBy)) ?? null;
    };

    const data = notices.map((n) => ({
      id: n.id,
      targetRoleCodes: n.targets.map((t) => t.roleCode),
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
      createdByName: resolveCreatedByName(n),
      updatedAt: n.updatedAt,
      updatedBy: n.updatedBy,
      updatedByName: resolveUpdatedByName(n),
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

    // targetRoleCodes DB 활성 검증 — 비활성/미존재 권한코드 차단
    const activeRoles = await resolveActiveRoleCodes();
    const inactiveRoles = result.data.targetRoleCodes.filter((c) => !activeRoles.has(c));
    if (inactiveRoles.length > 0) {
      return NextResponse.json(
        { error: "無効な権限コードが含まれています", invalidRoleCodes: inactiveRoles },
        { status: 400 },
      );
    }

    // 게시기간이 겹치는 공지가 동일 권한별 5건 초과인지 검사 + 등록을 트랜잭션으로 처리.
    // 권한별(roleCode별) 5건 한도 — 각 권한은 독립적으로 카운트되어 한 권한의 한도가
    // 다른 권한의 노출을 막지 않도록 함.
    const notice = await prisma.$transaction(
      async (tx) => {
        // 권한별 5건 한도 일괄 검사 — N+1 루프 대신 단일 GROUP BY 집계 쿼리
        const overLimit = await tx.$queryRaw<{ role_code: string }[]>`
          SELECT hnt.role_code
          FROM qp_home_notice_targets hnt
          JOIN qp_home_notices hn ON hn.id = hnt.home_notice_id
          WHERE hnt.role_code IN (${Prisma.join(result.data.targetRoleCodes)})
            AND hn.start_at <= ${result.data.endAt}
            AND hn.end_at   >= ${result.data.startAt}
          GROUP BY hnt.role_code
          HAVING COUNT(DISTINCT hn.id) >= 5
          LIMIT 1
        `;
        if (overLimit.length > 0) {
          throw new HomeNoticeCreateError("LIMIT_EXCEEDED", overLimit[0].role_code);
        }

        return tx.homeNotice.create({
          data: {
            title: result.data.title,
            content: result.data.content,
            url: result.data.url,
            startAt: result.data.startAt,
            endAt: result.data.endAt,
            userType: auth.user.userType,
            userId: auth.user.userId,
            createdBy: auth.user.userId,
            targets: {
              create: result.data.targetRoleCodes.map((code) => ({ roleCode: code })),
            },
          },
          include: { targets: { select: { roleCode: true } } },
        });
      },
      { isolationLevel: "Serializable" },
    );

    console.info("[POST /api/home-notices] created", {
      id: notice.id,
      by: maskEmail(auth.user.userId),
      role: auth.user.role,
    });

    return NextResponse.json(
      {
        data: {
          ...notice,
          targetRoleCodes: notice.targets.map((t) => t.roleCode),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof HomeNoticeCreateError && error.kind === "LIMIT_EXCEEDED") {
      return NextResponse.json(
        {
          error: "同一期間に同じ送信先で掲載できるお知らせは5件までです",
          code: "LIMIT_EXCEEDED",
          ...(error.target ? { target: error.target } : {}),
        },
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
