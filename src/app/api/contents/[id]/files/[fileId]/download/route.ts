import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { resolve } from "path";

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
      select: {
        status: true,
        targets: { select: { targetType: true, startAt: true, endAt: true } },
      },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canAccessContent(user, content.targets)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    // 다운로드 로그 기록 (실패해도 다운로드는 진행)
    if (user) {
      try {
        await prisma.downloadLog.create({
          data: {
            userType: user.userType,
            userId: user.userId,
            contentId: parsedId.data,
            attachmentId: parsedFileId.data,
          },
        });
      } catch (logError) {
        console.error("[download-log] Failed to record download log", {
          contentId: parsedId.data,
          attachmentId: parsedFileId.data,
          userId: user.userId,
          error: logError,
        });
      }
    }

    // 파일 읽기 (storage/ 디렉토리 기준, path traversal 방어)
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    const absolutePath = resolve(process.cwd(), attachment.filePath);

    if (!absolutePath.startsWith(storageRoot)) {
      return NextResponse.json({ error: "접근할 수 없는 경로입니다" }, { status: 403 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absolutePath);
    } catch (fsError: unknown) {
      if (fsError instanceof Error && "code" in fsError) {
        const code = (fsError as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          console.error("[download] File missing from disk", {
            absolutePath,
            attachmentId: parsedFileId.data,
          });
          return NextResponse.json(
            { error: "파일이 서버에 존재하지 않습니다" },
            { status: 404 },
          );
        }
      }
      throw fsError;
    }

    return new NextResponse(fileBuffer as unknown as BodyInit, {
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
