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
// 보안 강화 (Boston MEDIUM): 외부에서 URL 에 ?preview=true 를 수동 추가해 로그를 우회하는
// 시나리오를 차단하기 위해 동일 origin 요청일 때만 preview 효과를 인정한다.
// 검증 2단 — Referer 가 동일 origin 이고 Sec-Fetch-Site 도 same-origin 일 때만 통과.
// - Referer 는 클라이언트가 위조 가능 (UA 설정, 확장)
// - Sec-Fetch-Site 는 브라우저가 직접 부여하는 fetch metadata 로 위조 불가
// - Sec-Fetch-Site 미지원 구형 UA(Safari 일부 구버전) 폴백 — Referer 만으로도 인정하되 로그 남김
//
// TODO(후속): preview 경로를 `/preview` 엔드포인트로 분리하면 query 우회 자체가 불가해짐.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id, fileId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    const parsedFileId = idParamSchema.safeParse(fileId);
    const previewRequested = request.nextUrl.searchParams.get("preview") === "true";
    const referer = request.headers.get("referer") ?? "";
    // URL 파싱 후 origin 비교 — `startsWith` prefix 매칭은 `example.com.attacker.com` 같은
    // 위조 referer 통과 가능. invalid URL 은 폴백에서 거부됨.
    let refererOrigin: string | null = null;
    try {
      refererOrigin = referer ? new URL(referer).origin : null;
    } catch {
      refererOrigin = null;
    }
    const sameOriginReferer = refererOrigin === request.nextUrl.origin;
    const fetchSite = request.headers.get("sec-fetch-site");
    // same-origin 만 신뢰. cross-site/same-site/none 은 외부 진입으로 간주.
    const isSameOriginFetch = fetchSite === "same-origin";
    // Sec-Fetch-Site 미지원 UA — 헤더가 null. 이 경우 Referer 만으로 폴백.
    const isPreview = previewRequested && (
      isSameOriginFetch || (fetchSite === null && sameOriginReferer)
    );
    if (previewRequested && !isPreview) {
      console.warn("[download] preview 요청 거부 — 외부 origin", {
        hasReferer: referer.length > 0,
        fetchSite,
      });
    }

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
        // MIME 스니핑 차단 — md/txt 등 텍스트 파일을 브라우저가 text/html 로 추론해 인라인 렌더링하는 우회 차단.
        "X-Content-Type-Options": "nosniff",
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
