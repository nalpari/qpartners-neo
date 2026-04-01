import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadLogsQuerySchema } from "@/lib/schemas/content";

// GET /api/download-logs — 다운로드 기록 조회
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request.headers);

    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 },
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
      userType: user.userType,
      userId: user.userId,
      ...(keyword && {
        OR: [
          { content: { title: { contains: keyword } } },
          { attachment: { fileName: { contains: keyword } } },
        ],
      }),
    };

    const [logs, total] = await Promise.all([
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
    const data = logs.map((log) => {
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
        contentId: log.contentId,
        contentTitle: log.content.title,
        contentStatus: log.content.status,
        fileName: log.attachment.fileName,
        downloadedAt: log.downloadedAt,
        isExpired,
      };
    });

    return NextResponse.json({
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("[GET /api/download-logs]", error);
    return NextResponse.json(
      { error: "Failed to fetch download logs" },
      { status: 500 },
    );
  }
}
