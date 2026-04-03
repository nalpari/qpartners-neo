import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { downloadLogsQuerySchema } from "@/lib/schemas/content";

// GET /api/mypage/download-logs — 다운로드 기록 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }

    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = downloadLogsQuerySchema.safeParse(params);

    if (!query.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: query.error.issues },
        { status: 400 },
      );
    }

    const { page, pageSize, keyword } = query.data;

    const where = {
      userType: user.userTp,
      userId: user.userId,
      ...(keyword && {
        OR: [
          { content: { title: { contains: keyword } } },
          { attachment: { fileName: { contains: keyword } } },
        ],
      }),
    };

    const [logs, totalCount] = await Promise.all([
      prisma.downloadLog.findMany({
        where,
        include: {
          content: { select: { title: true, status: true, targets: { select: { startAt: true, endAt: true } } } },
          attachment: { select: { fileName: true } },
        },
        orderBy: { downloadedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.downloadLog.count({ where }),
    ]);

    const now = new Date();
    const list = logs.map((log) => {
      const targets = log.content.targets;
      const isExpired =
        log.content.status !== "published" ||
        targets.length === 0 ||
        targets.every(
          (t) =>
            (t.endAt !== null && t.endAt < now) ||
            (t.startAt !== null && t.startAt > now),
        );

      return {
        id: log.id,
        downloadedAt: log.downloadedAt,
        contentId: log.contentId,
        contentTitle: log.content.title,
        attachmentId: log.attachmentId,
        fileName: log.attachment.fileName,
        isExpired,
      };
    });

    return NextResponse.json({
      data: {
        totalCount,
        page,
        pageSize,
        keyword: keyword ?? null,
        list,
      },
    });
  } catch (error) {
    console.error("[GET /api/mypage/download-logs] 다운로드 기록 목록 조회 실패", error);
    return NextResponse.json(
      { error: "ダウンロード履歴の取得に失敗しました" },
      { status: 500 },
    );
  }
}
