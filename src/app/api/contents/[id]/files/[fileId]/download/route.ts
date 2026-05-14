import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string; fileId: string }> };

// GET /api/contents/:id/files/:fileId/download — 첨부파일 다운로드
//
// ?preview=true 쿼리가 붙은 호출은 화면 미리보기(이미지 <img>, PDF 첫페이지 렌더 등) 용도이며
// 실제 사용자의 다운로드 의사로 해석하지 않는다. 이 경우 DownloadLog 기록을 건너뛴다.
//
// 보안 강화 (Boston MEDIUM #1): 외부에서 URL 에 ?preview=true 를 수동 추가해 로그를 우회하는
// 시나리오를 차단하기 위해 Referer 가 동일 origin 일 때만 preview 효과를 인정한다.
// Referer 가 없거나 외부 origin 이면 미리보기 의도로 보지 않고 정상 다운로드 로그를 기록한다.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id, fileId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    const parsedFileId = idParamSchema.safeParse(fileId);
    const previewRequested = request.nextUrl.searchParams.get("preview") === "true";
    const referer = request.headers.get("referer") ?? "";
    const sameOriginReferer = referer.startsWith(request.nextUrl.origin);
    const isPreview = previewRequested && sameOriginReferer;

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
        targets: { select: { roleCode: true, startAt: true, endAt: true } },
      },
    });

    if (!content || content.status !== "published") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canAccessContent(user, content.targets)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    // 파일 읽기 (UPLOAD_DIR 기준, path traversal 방어)
    const storageRoot = resolve(UPLOAD_DIR);
    const absolutePath = resolve(UPLOAD_DIR, attachment.filePath);

    if (!isInsideDir(absolutePath, storageRoot)) {
      return NextResponse.json({ error: "접근할 수 없는 경로입니다" }, { status: 403 });
    }

    const regular = await isRegularFile(absolutePath);
    if (!regular) {
      console.error("[download] 정규 파일 아님/부재:", relative(UPLOAD_DIR, absolutePath));
      return NextResponse.json(
        { error: "파일이 서버에 존재하지 않습니다" },
        { status: 404 },
      );
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absolutePath);
    } catch (fsError: unknown) {
      // isRegularFile 통과 후 readFile 사이 TOCTOU 윈도우 방어
      if (
        fsError instanceof Error &&
        "code" in fsError &&
        (fsError as { code?: string }).code === "ENOENT"
      ) {
        console.error("[download] 파일 디스크 부재 (TOCTOU)", {
          filePath: relative(UPLOAD_DIR, absolutePath),
          attachmentId: parsedFileId.data,
        });
        return NextResponse.json(
          { error: "파일이 서버에 존재하지 않습니다" },
          { status: 404 },
        );
      }
      throw fsError;
    }

    // 다운로드 로그 기록 — 파일 읽기 성공 후에만 기록 (실패해도 다운로드는 진행)
    // 미리보기(?preview=true) 호출은 사용자의 다운로드 의사가 아니므로 로그 기록 생략.
    if (user && !isPreview) {
      try {
        await prisma.downloadLog.create({
          data: {
            userType: user.userType,
            userId: user.userId,
            contentId: parsedId.data,
            attachmentId: parsedFileId.data,
          },
        });
      } catch {
        console.error("[download-log] Failed to record download log", {
          contentId: parsedId.data,
          attachmentId: parsedFileId.data,
        });
      }
    }

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": attachment.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
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
