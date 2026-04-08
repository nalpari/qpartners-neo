import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { basename, resolve } from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { isInsideDir } from "@/lib/path-safety";
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
      return NextResponse.json({ error: "IDの形式が正しくありません" }, { status: 400 });
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
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    if (!canAccessContent(user, content.targets)) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
    }

    if (content.attachments.length === 0) {
      return NextResponse.json(
        { error: "添付ファイルがありません" },
        { status: 404 },
      );
    }

    // 디스크 파일 존재 확인 (path traversal 방어 포함)
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    const validFiles: Array<{ id: number; fileName: string; absolutePath: string }> = [];

    for (const att of content.attachments) {
      const absolutePath = resolve(process.cwd(), att.filePath);
      // path traversal 방어 — relative 기반 검증 (startsWith prefix bug 회피)
      if (!isInsideDir(absolutePath, storageRoot)) {
        console.error("[download-all] 이상 경로 감지:", absolutePath);
        continue;
      }
      try {
        await stat(absolutePath);
        validFiles.push({ id: att.id, fileName: att.fileName, absolutePath });
      } catch (statError: unknown) {
        console.warn("[download-all] 디스크 파일 누락:", {
          attachmentId: att.id,
          filePath: att.filePath,
          error: statError,
        });
      }
    }

    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: "ダウンロード可能なファイルがありません" },
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
      // 에러 즉시 전파 — passThrough 파괴 → webStream controller.error 트리거 → 클라이언트도 끊김 감지
      archive.abort();
      passThrough.destroy(err instanceof Error ? err : new Error(String(err)));
    });

    // 중복 파일명 처리하면서 ZIP에 추가
    // basename으로 한 번 더 sanitize (Zip Slip 방어 — DB의 fileName이 과거 비위생화 데이터일 수 있음)
    const usedNames = new Set<string>();
    for (const f of validFiles) {
      const archivedName = resolveDuplicateName(usedNames, basename(f.fileName));
      archive.append(createReadStream(f.absolutePath), { name: archivedName });
    }

    archive.finalize().catch((err: unknown) => {
      console.error("[download-all] archive.finalize 실패:", err);
    });

    // ZIP 파일명 생성 (안전한 ASCII fallback + UTF-8 인코딩)
    const safeBaseName = (content.title || "content").replace(/[\/\\?%*:|"<>]/g, "_");
    const zipFileName = `${safeBaseName}_attachments.zip`;

    // PassThrough → Web ReadableStream
    // - cancel(): 클라이언트가 응답 취소 시 archiver/stream 즉시 정리 (FD 누수 방지)
    // - pull() + desiredSize: 배압 처리 (slow client → archiver pause로 메모리 누수 방지)
    // - request.signal: HTTP 연결 abort 시에도 동일 cleanup
    let logFiredOnce = false;
    const fireDownloadLogIfNeeded = () => {
      if (logFiredOnce) return;
      logFiredOnce = true;
      // DownloadLog 기록은 ZIP이 실제로 클라이언트에게 송출 완료된 시점에서만 작성
      // (이전에는 finalize 직후 기록되어 abort/error 시 false positive 감사 로그 발생)
      if (!user) return;
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
    };

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        passThrough.on("data", (chunk: Buffer) => {
          controller.enqueue(chunk);
          if ((controller.desiredSize ?? 0) <= 0) {
            passThrough.pause();
          }
        });
        passThrough.on("end", () => {
          fireDownloadLogIfNeeded();
          controller.close();
        });
        passThrough.on("error", (err: Error) => {
          console.error("[download-all] passThrough 에러:", err);
          controller.error(err);
        });
      },
      pull() {
        passThrough.resume();
      },
      cancel() {
        console.warn("[download-all] 클라이언트 취소 감지 — archiver/stream 정리");
        archive.abort();
        passThrough.destroy();
      },
    });

    request.signal.addEventListener("abort", () => {
      console.warn("[download-all] request abort 감지 — archiver/stream 정리");
      archive.abort();
      passThrough.destroy();
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(zipFileName)}`,
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/contents/:id/files/download-all] 실패:", error);
    return NextResponse.json(
      { error: "ZIPダウンロードに失敗しました" },
      { status: 500 },
    );
  }
}
