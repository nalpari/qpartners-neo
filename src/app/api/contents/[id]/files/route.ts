import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, basename, relative, resolve } from "path";
import { randomUUID } from "crypto";

import { canModifyResource, requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { MAX_FILE_SIZE, validateFiles } from "@/lib/file-validation";
import { logError } from "@/lib/log-error";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

// POST /api/contents/:id/files — 첨부파일 업로드
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMenuPermission(request.headers, "CONTENT", "create");
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "IDの形式が正しくありません" }, { status: 400 });
    }

    // Body size 사전 차단 — formData() 호출 전 Content-Length 확인 (DoS 방어)
    // MF-1 대응: Content-Length 누락(chunked transfer encoding) 시 formData()가 무제한
    //            바디를 메모리에 버퍼링해 OOM을 유발할 수 있음. 헤더가 없는 요청은 411로 거부.
    //            (fast-path: 리버스 프록시에서도 body size limit를 두는 것이 최종 방어선)
    // 다중 파일이므로 여유롭게 MAX_FILE_SIZE * 5 + 헤더 오버헤드를 한도로 적용
    const rawContentLength = request.headers.get("content-length");
    if (rawContentLength === null) {
      console.warn("[POST /api/contents/:id/files] Content-Length 누락 — chunked encoding 거부");
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
    const MAX_BATCH_SIZE = MAX_FILE_SIZE * 5 + 1024 * 1024; // ~251MB
    if (contentLength > MAX_BATCH_SIZE) {
      console.warn("[POST /api/contents/:id/files] Content-Length 초과:", contentLength);
      return NextResponse.json(
        { error: "リクエストサイズが大きすぎます" },
        { status: 413 },
      );
    }

    // 콘텐츠 존재 + 수정 권한 확인
    const content = await prisma.content.findUnique({
      where: { id: parsed.data },
      select: { id: true, status: true, userType: true, userId: true },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    if (!(await canModifyResource(user, content))) {
      return NextResponse.json(
        { error: "ファイルアップロードの権限がありません" },
        { status: 403 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formError: unknown) {
      console.warn("[POST /api/contents/:id/files] multipart 파싱 실패:", formError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "ファイルを選択してください" },
        { status: 400 },
      );
    }

    // 0-byte 파일 거부 (PUT과 일관성)
    if (files.some((f) => f.size === 0)) {
      return NextResponse.json(
        { error: "空のファイルはアップロードできません" },
        { status: 400 },
      );
    }

    // 파일 검증 — 공통 유틸 사용 (size, 확장자, MIME)
    const validation = validateFiles(files);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // public/ 외부에 저장 → 다운로드 API를 통해서만 접근 가능
    const uploadDir = join(UPLOAD_DIR, "contents", String(parsed.data));
    await mkdir(uploadDir, { recursive: true });
    const uploadDirAbsolute = resolve(uploadDir);

    // 1단계: 모든 파일을 디스크에 기록
    const writtenFiles: { absolutePath: string; file: File; filePath: string; safeFileName: string; archivedName: string }[] = [];

    for (const file of files) {
      // basename으로 path 컴포넌트 제거 (Zip Slip 방어 — DB 저장값에서 ../ 제거)
      const sanitizedName = basename(file.name);
      const ext = sanitizedName.split(".").pop() ?? "";
      const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
      const filePath = `contents/${parsed.data}/${safeFileName}`;
      const absolutePath = resolve(uploadDir, safeFileName);

      // path traversal 방어 — relative 기반 검증 (startsWith prefix bug 회피)
      if (!isInsideDir(absolutePath, uploadDirAbsolute)) {
        return NextResponse.json({ error: "ファイル名が正しくありません" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(absolutePath, buffer);
      writtenFiles.push({ absolutePath, file, filePath, safeFileName, archivedName: sanitizedName });
    }

    // 2단계: 트랜잭션으로 모든 DB 레코드 일괄 생성 (전부 성공 or 전부 롤백)
    try {
      const attachments = await prisma.$transaction(
        writtenFiles.map((w) =>
          prisma.contentAttachment.create({
            data: {
              contentId: parsed.data,
              // basename 적용된 이름만 저장 (../  제거 — Zip Slip 방어)
              fileName: w.archivedName,
              filePath: w.filePath,
              fileSize: BigInt(w.file.size),
              mimeType: w.file.type || null,
              createdBy: user.userId,
            },
          }),
        ),
      );

      return NextResponse.json({
        data: attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileSize: a.fileSize !== null ? Number(a.fileSize) : null,
          mimeType: a.mimeType,
        })),
      }, { status: 201 });
    } catch (dbError: unknown) {
      // DB 트랜잭션 실패 시 디스크에 쓴 파일 전부 정리
      for (const w of writtenFiles) {
        await unlink(w.absolutePath).catch((unlinkErr: unknown) => {
          console.error("[POST /api/contents/:id/files] DB 실패 후 파일 정리 실패:", {
            path: relative(UPLOAD_DIR, w.absolutePath),
            error: unlinkErr,
          });
        });
      }
      throw dbError;
    }
  } catch (error: unknown) {
    logError("POST /api/contents/:id/files", error);
    return NextResponse.json(
      { error: "添付ファイルのアップロードに失敗しました" },
      { status: 500 },
    );
  }
}
