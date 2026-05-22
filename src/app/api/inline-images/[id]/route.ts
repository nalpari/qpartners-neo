import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";

import { canAccessContent, getUserFromHeaders, isInternalUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import {
  ALLOWED_INLINE_IMAGE_EXTENSIONS,
  ALLOWED_INLINE_IMAGE_MIMES,
} from "@/lib/inline-image-validation";
import { logError } from "@/lib/log-error";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/common";

/**
 * filePath/fileName 의 확장자로 정규 MIME 을 추론.
 * 업로드 폴백으로 DB 에 `application/octet-stream` 으로 저장된 기존 행의 회귀 방지용 — 안전한 화이트리스트 매핑만 제공.
 */
function mimeFromExt(filePath: string): string | null {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_INLINE_IMAGE_EXTENSIONS.has(ext)) return null;
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/inline-images/:id — 본문 임베드 이미지 조회.
 *
 * 접근 정책:
 *   · published 콘텐츠: canAccessContent(targets) — 비회원 포함, 게시대상/기간 검증
 *   · 미게시(draft 등) 콘텐츠: 업로더 본인 또는 사내 사용자(SUPER_ADMIN/ADMIN)만
 *   · 임시 업로드(contentId=null, 폼 저장 전): 업로더 본인만 — URL 추측 방어
 *
 * 비회원 공개 콘텐츠의 본문 inline image 는 비회원도 fetch 가능해야 하므로
 * 첨부 다운로드와 동일하게 미들웨어 통과 후 핸들러에서 ACL 분기한다.
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
        ownerType: true,
        ownerUserId: true,
        content: {
          select: {
            status: true,
            targets: { select: { roleCode: true, startAt: true, endAt: true } },
          },
        },
      },
    });

    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const me = getUserFromHeaders(request.headers);
    const isPublished = image.content?.status === "published";

    if (isPublished && image.content) {
      if (!canAccessContent(me, image.content.targets)) {
        return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
      }
    } else {
      // 미게시(draft 등) 또는 임시(contentId=null) → 인증 + 소유/사내 분기.
      // - 임시(image.content === null): 업로더 본인만 (URL 추측 차단)
      // - 미게시(image.content 존재, status !== published): 업로더 본인 또는 사내 사용자
      if (!me) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const isOwner =
        me.userType === image.ownerType && me.userId === image.ownerUserId;
      const allowed = isOwner || (image.content !== null && isInternalUser(me.role));
      if (!allowed) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
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

    // 인라인 렌더링 응답이라 MIME 스니핑 위험이 다운로드보다 큼 — 화이트리스트 외 mimeType 은 415 로 거부.
    // 업로드 정책(`ALLOWED_INLINE_IMAGE_MIMES`)과 동일 화이트리스트로 통일 (BMP 등 첨부용 MIME 제외).
    //
    // 회귀 방지: 업로드 라우트가 빈 MIME 시 `application/octet-stream` 으로 폴백 저장한 기존 행은
    // filePath 의 확장자로 정규 MIME 을 추론해 화이트리스트 재검증한다. 새 nosniff 가드가 정상
    // 데이터를 차단하지 않도록 ext 폴백을 명시적으로 허용.
    const candidateMime = image.mimeType && image.mimeType !== "application/octet-stream"
      ? image.mimeType
      : mimeFromExt(image.filePath);
    const safeMime = candidateMime && ALLOWED_INLINE_IMAGE_MIMES.has(candidateMime)
      ? candidateMime
      : null;
    if (!safeMime) {
      console.warn("[GET /api/inline-images/:id] 비허용 MIME — 인라인 렌더 차단:", {
        imageId: parsed.data,
        mimeType: image.mimeType,
        filePath: image.filePath,
      });
      return NextResponse.json(
        { error: "サポートされていない画像形式です" },
        { status: 415 },
      );
    }

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": safeMime,
        "Content-Disposition": "inline",
        "Content-Length": String(fileBuffer.length),
        // 미게시/임시는 권한·상태 변경이 즉시 반영되도록 캐시 금지.
        "Cache-Control": isPublished ? "private, max-age=3600" : "private, no-store",
        // MIME 스니핑 차단 — 인라인 렌더 경로의 XSS 우회 차단 (다운로드 라우트와 동일 정책).
        "X-Content-Type-Options": "nosniff",
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
