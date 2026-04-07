import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { resolve } from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

/** 동일 파일명 충돌 시 ` (1)`, ` (2)` 번호 부여 */
function resolveDuplicateName(used: Set<string>, fileName: string): string {
  if (!used.has(fileName)) {
    used.add(fileName);
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : "";

  let counter = 1;
  let candidate = `${base} (${counter})${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${base} (${counter})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

// GET /api/contents/:id/files/download-all — 콘텐츠 첨부파일 전체 ZIP 다운로드
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);

    const { id } = await params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 콘텐츠 조회 + 접근권한 검증
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        title: true,
        status: true,
        targets: { select: { targetType: true, startAt: true, endAt: true } },
        attachments: {
          select: { id: true, fileName: true, filePath: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!content || content.status !== "published") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canAccessContent(user, content.targets)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    if (content.attachments.length === 0) {
      return NextResponse.json(
        { error: "첨부파일이 없습니다" },
        { status: 404 },
      );
    }

    // 디스크 파일 존재 확인 (path traversal 방어 포함)
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    const validFiles: Array<{ id: number; fileName: string; absolutePath: string }> = [];

    for (const att of content.attachments) {
      const absolutePath = resolve(process.cwd(), att.filePath);
      if (!absolutePath.startsWith(storageRoot)) {
        console.error("[download-all] 이상 경로 감지:", absolutePath);
        continue;
      }
      try {
        await stat(absolutePath);
        validFiles.push({ id: att.id, fileName: att.fileName, absolutePath });
      } catch {
        console.error("[download-all] 디스크 파일 누락:", {
          attachmentId: att.id,
          filePath: att.filePath,
        });
      }
    }

    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: "다운로드 가능한 파일이 없습니다" },
        { status: 404 },
      );
    }

    // ZIP 스트림 생성
    const archive = archiver("zip", { zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    archive.on("warning", (err: unknown) => {
      console.warn("[download-all] archiver 경고:", err);
    });
    archive.on("error", (err: unknown) => {
      console.error("[download-all] archiver 에러:", err);
    });

    // 중복 파일명 처리하면서 ZIP에 추가
    const usedNames = new Set<string>();
    for (const f of validFiles) {
      const safeName = resolveDuplicateName(usedNames, f.fileName);
      archive.append(createReadStream(f.absolutePath), { name: safeName });
    }

    void archive.finalize();

    // DownloadLog 기록 (사용자 식별되는 경우만, 비동기 — 실패해도 다운로드는 진행)
    if (user) {
      void Promise.all(
        validFiles.map((f) =>
          prisma.downloadLog.create({
            data: {
              userType: user.userType,
              userId: user.userId,
              contentId: parsedId.data,
              attachmentId: f.id,
            },
          }).catch((err: unknown) => {
            console.error("[download-all] DownloadLog 기록 실패:", {
              attachmentId: f.id,
              error: err,
            });
          }),
        ),
      );
    }

    // ZIP 파일명 생성 (안전한 ASCII fallback + UTF-8 인코딩)
    const safeBaseName = (content.title || "content").replace(/[\/\\?%*:|"<>]/g, "_");
    const zipFileName = `${safeBaseName}_attachments.zip`;

    // ReadableStream으로 변환하여 Response 반환
    // PassThrough → Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        passThrough.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        passThrough.on("end", () => controller.close());
        passThrough.on("error", (err: Error) => controller.error(err));
      },
    });

    return new NextResponse(webStream as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(zipFileName)}`,
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/contents/:id/files/download-all] 실패:", error);
    return NextResponse.json(
      { error: "ZIP 다운로드에 실패했습니다" },
      { status: 500 },
    );
  }
}
