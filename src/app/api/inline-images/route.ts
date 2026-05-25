import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { basename, join, relative, resolve } from "path";
import { randomUUID } from "crypto";

import type { UserInfo } from "@/lib/auth";
import { requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import {
  ALLOWED_INLINE_IMAGE_EXTENSIONS,
  MAX_INLINE_IMAGE_SIZE,
  validateInlineImage,
} from "@/lib/inline-image-validation";
import { logError } from "@/lib/log-error";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/inline-images — BlockNote 본문 임베드 이미지 업로드.
 *
 * 라이프사이클:
 *   - `contentId=null` 상태로 디스크/DB에 선존재
 *   - 폼 저장 시 본문이 참조한 ID만 `reconcileInlineImages` 가 `contentId` 로 stamp
 *   - 미사용 행은 폼 저장 트랜잭션에서 즉시 정리
 *
 * 권한: CONTENT.create / .update 둘 중 하나 통과 (등록 폼/수정 폼 양쪽에서 호출).
 */
export async function POST(request: NextRequest) {
  try {
    // 권한: 등록 폼/수정 폼 양쪽에서 호출되므로 CONTENT.create 또는 .update 둘 중 하나면 통과.
    // 단, 401(미인증)은 403(권한 부족)과 분리해야 한다 — 토큰 만료 사용자가 권한 메시지를 받으면 재로그인 유도가 안 됨.
    const authCreate = await requireMenuPermission(
      request.headers,
      "CONTENT",
      "create",
    );
    let auth: { user: UserInfo } | NextResponse;
    if (authCreate instanceof NextResponse) {
      if (authCreate.status === 401) return authCreate;
      auth = await requireMenuPermission(request.headers, "CONTENT", "update");
    } else {
      auth = authCreate;
    }
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

    // Content-Length 사전 차단 (DoS 방어 — chunked encoding 거부 + 한도 초과 즉시 413)
    const rawContentLength = request.headers.get("content-length");
    if (rawContentLength === null) {
      console.warn("[POST /api/inline-images] Content-Length 누락 — chunked encoding 거부");
      return NextResponse.json(
        { error: "Content-Lengthヘッダーが必要です" },
        { status: 411 },
      );
    }
    const contentLength = Number(rawContentLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return NextResponse.json(
        { error: "リクエストサイズが不正です" },
        { status: 400 },
      );
    }
    const MAX_REQUEST_SIZE = MAX_INLINE_IMAGE_SIZE + 1024 * 1024; // 파일 본문 + multipart 경계/헤더 여유 1MB
    if (contentLength > MAX_REQUEST_SIZE) {
      console.warn("[POST /api/inline-images] Content-Length 초과:", contentLength);
      return NextResponse.json(
        { error: "画像サイズが5MBを超えています" },
        { status: 413 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formError: unknown) {
      console.warn("[POST /api/inline-images] multipart 파싱 실패:", formError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "画像ファイルが必要です" },
        { status: 400 },
      );
    }

    const validation = validateInlineImage(fileEntry);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 월 단위 디렉토리: inline-images/{yyyy}/{mm}/ — UTC 기준(서버 TZ 영향 제거).
    // 한 디렉토리당 파일 수가 무한히 늘어나지 않도록 분할 (FS 성능 + 운영 가시성).
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const subDir = join("inline-images", yyyy, mm);
    const uploadDir = join(UPLOAD_DIR, subDir);
    await mkdir(uploadDir, { recursive: true });
    const uploadDirAbsolute = resolve(uploadDir);

    const sanitizedName = basename(fileEntry.name);
    // 디스크에 쓸 ext 는 화이트리스트로만 — basename 만으로는 NUL 등 일부 OS 의존 엣지케이스가 남는다.
    // validateInlineImage 가 이미 통과시킨 이상 정상 ext 만 들어오지만, 디스크 경계에서도 다시 강제.
    const rawExt = (sanitizedName.split(".").pop() ?? "").toLowerCase();
    const ext = ALLOWED_INLINE_IMAGE_EXTENSIONS.has(rawExt) ? rawExt : "";
    const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
    const filePath = join(subDir, safeFileName); // UPLOAD_DIR 기준 상대 경로
    const absolutePath = resolve(uploadDir, safeFileName);

    if (!isInsideDir(absolutePath, uploadDirAbsolute)) {
      return NextResponse.json(
        { error: "ファイル名が正しくありません" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    await writeFile(absolutePath, buffer);

    // 빈 MIME (드래그앤드롭 등) 폴백 — application/octet-stream 대신 확장자 기반 정규 MIME 으로 저장.
    // 인라인 조회 라우트의 nosniff/415 가드와 자연 일치 (ext 는 위에서 ALLOWED_INLINE_IMAGE_EXTENSIONS 화이트리스트 통과값).
    const fallbackMime =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "png" ? "image/png" :
      ext === "gif" ? "image/gif" :
      ext === "webp" ? "image/webp" :
      "application/octet-stream";
    const resolvedMime = fileEntry.type || fallbackMime;

    try {
      const created = await prisma.contentInlineImage.create({
        data: {
          contentId: null,
          ownerType: user.userType,
          ownerUserId: user.userId,
          fileName: sanitizedName,
          filePath,
          fileSize: BigInt(fileEntry.size),
          mimeType: resolvedMime,
        },
        select: { id: true },
      });

      return NextResponse.json(
        {
          data: {
            id: created.id,
            url: `/api/inline-images/${created.id}`,
          },
        },
        { status: 201 },
      );
    } catch (dbError: unknown) {
      // DB 실패 시 디스크에 쓴 파일 정리
      await unlink(absolutePath).catch((unlinkErr: unknown) => {
        console.error("[POST /api/inline-images] DB 실패 후 파일 정리 실패:", {
          path: relative(UPLOAD_DIR, absolutePath),
          error: unlinkErr,
        });
      });
      throw dbError;
    }
  } catch (error: unknown) {
    logError("POST /api/inline-images", error);
    return NextResponse.json(
      { error: "画像のアップロードに失敗しました" },
      { status: 500 },
    );
  }
}
