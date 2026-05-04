import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { logError } from "@/lib/log-error";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/common";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/inline-images/:id — BlockNote 본문 임베드 이미지 조회.
 *
 * 접근 정책: 부모 Content 의 게시대상(targets) 기반으로 canAccessContent 검증.
 * 비회원 공개 콘텐츠의 본문 inline image 는 비회원도 fetch 가능해야 하므로
 * 첨부 다운로드와 동일하게 미들웨어 통과 후 핸들러에서 ACL 분기한다.
 * contentId=null (폼 저장 전 임시 업로드) 인 image 는 fail-closed 로 404.
 *
 * 본문 임베드는 페이지뷰 × N개 단위로 호출 빈도가 높아 DownloadLog 와 의미가 달라 로그 미기록.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const image = await prisma.contentInlineImage.findUnique({
      where: { id: parsed.data },
      select: {
        filePath: true,
        mimeType: true,
        content: {
          select: {
            status: true,
            targets: { select: { targetType: true, startAt: true, endAt: true } },
          },
        },
      },
    });

    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // contentId=null (폼 저장 전 임시 inline image) 또는 미게시 콘텐츠 → 노출 차단
    if (!image.content || image.content.status !== "published") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = getUserFromHeaders(request.headers);
    if (!canAccessContent(user, image.content.targets)) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
    }

    const storageRoot = resolve(UPLOAD_DIR);
    const absolutePath = resolve(UPLOAD_DIR, image.filePath);

    if (!isInsideDir(absolutePath, storageRoot)) {
      return NextResponse.json({ error: "アクセスできないパスです" }, { status: 403 });
    }

    const regular = await isRegularFile(absolutePath);
    if (!regular) {
      console.error(
        "[GET /api/inline-images/:id] 정규 파일 아님/부재:",
        relative(UPLOAD_DIR, absolutePath),
      );
      return NextResponse.json(
        { error: "ファイルが存在しません" },
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
        console.error("[GET /api/inline-images/:id] 디스크 부재 (TOCTOU):", {
          filePath: relative(UPLOAD_DIR, absolutePath),
          imageId: parsed.data,
        });
        return NextResponse.json(
          { error: "ファイルが存在しません" },
          { status: 404 },
        );
      }
      throw fsError;
    }

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": image.mimeType || "application/octet-stream",
        "Content-Disposition": "inline",
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: unknown) {
    logError("GET /api/inline-images/:id", error);
    return NextResponse.json(
      { error: "画像の取得に失敗しました" },
      { status: 500 },
    );
  }
}
