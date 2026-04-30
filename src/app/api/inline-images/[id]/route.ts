import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";

import { getUserFromHeaders } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { logError } from "@/lib/log-error";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/common";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/inline-images/:id — BlockNote 본문 임베드 이미지 조회.
 *
 * 접근 정책: 인증된 사용자 누구나. 게시대상/published 검증은 의도적으로 생략 — 본문 렌더 시점에
 * `<img>` 직렬 호출이 폭주하므로 매 요청마다 콘텐츠 권한 검증을 수행하면 비용이 폭주한다.
 * (인증된 사용자만 접근 가능 + autoincrement ID 는 추측 가능하지만, 본문 임베드 이미지의 기밀성은
 *  부모 Content ACL 에 위임 — 본문이 보이지 않으면 ID 도 노출되지 않는다.)
 *
 * 본문 임베드는 페이지뷰 × N개 단위로 호출 빈도가 높아 DownloadLog 와 의미가 달라 로그 미기록.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const image = await prisma.contentInlineImage.findUnique({
      where: { id: parsed.data },
      select: { filePath: true, mimeType: true },
    });

    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
