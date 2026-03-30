import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string; fileId: string }> };

// GET /api/contents/:id/files/:fileId/download — 첨부파일 다운로드
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id, fileId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    const parsedFileId = idParamSchema.safeParse(fileId);

    if (!parsedId.success || !parsedFileId.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const attachment = await prisma.contentAttachment.findFirst({
      where: { id: parsedFileId.data, contentId: parsedId.data },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 게시대상 접근제어
    const user = getUserFromHeaders(request.headers);
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      include: { targets: { select: { targetType: true, startAt: true, endAt: true } } },
    });

    if (content && !canAccessContent(user, content.targets)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    // 다운로드 로그 기록
    if (user) {
      await prisma.downloadLog.create({
        data: {
          userType: user.userType,
          userId: user.userId,
          contentId: parsedId.data,
          attachmentId: parsedFileId.data,
        },
      });
    }

    // 파일 읽기 & 스트리밍
    const absolutePath = join(process.cwd(), "public", attachment.filePath);
    const fileBuffer = await readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": attachment.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error("[GET /api/contents/:id/files/:fileId/download]", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 },
    );
  }
}
