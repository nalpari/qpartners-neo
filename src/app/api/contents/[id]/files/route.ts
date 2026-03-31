import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, basename, resolve } from "path";
import { randomUUID } from "crypto";

import { canModifyContent, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

// POST /api/contents/:id/files — 첨부파일 업로드
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;
    const user = auth.user;

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 콘텐츠 존재 + 수정 권한 확인
    const content = await prisma.content.findUnique({
      where: { id: parsed.data },
      select: { id: true, status: true, userId: true, authorDepartment: true },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canModifyContent(user, content)) {
      return NextResponse.json(
        { error: "파일 업로드 권한이 없습니다" },
        { status: 403 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart form data" },
        { status: 400 },
      );
    }
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "파일을 선택해주세요" },
        { status: 400 },
      );
    }

    // 파일 크기 제한 (50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    // 허용 MIME 타입
    const ALLOWED_MIMES = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    // 허용 확장자 (MIME 검증과 이중 체크) — SVG 제외 (XSS 위험)
    const ALLOWED_EXTENSIONS = new Set([
      "pdf", "docx", "xlsx", "pptx",
      "jpg", "jpeg", "png", "gif", "webp", "bmp",
    ]);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `파일 크기가 50MB를 초과합니다: ${file.name}` },
          { status: 400 },
        );
      }
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { error: `허용되지 않는 파일 확장자입니다: ${file.name}` },
          { status: 400 },
        );
      }
      const mime = file.type || "";
      if (!ALLOWED_MIMES.includes(mime) && !mime.startsWith("image/")) {
        return NextResponse.json(
          { error: `허용되지 않는 파일 형식입니다: ${file.name}` },
          { status: 400 },
        );
      }
    }

    // public/ 외부에 저장 → 다운로드 API를 통해서만 접근 가능
    const uploadDir = join(
      process.cwd(),
      "storage",
      "uploads",
      "contents",
      String(parsed.data),
    );
    await mkdir(uploadDir, { recursive: true });

    // 1단계: 모든 파일을 디스크에 기록
    const writtenFiles: { absolutePath: string; file: File; filePath: string; safeFileName: string }[] = [];

    for (const file of files) {
      const ext = basename(file.name).split(".").pop() ?? "";
      const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
      const filePath = `storage/uploads/contents/${parsed.data}/${safeFileName}`;
      const absolutePath = resolve(uploadDir, safeFileName);

      // path traversal 방어: 업로드 디렉토리 내부인지 검증
      if (!absolutePath.startsWith(resolve(uploadDir))) {
        return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(absolutePath, buffer);
      writtenFiles.push({ absolutePath, file, filePath, safeFileName });
    }

    // 2단계: 트랜잭션으로 모든 DB 레코드 일괄 생성 (전부 성공 or 전부 롤백)
    try {
      const attachments = await prisma.$transaction(
        writtenFiles.map((w) =>
          prisma.contentAttachment.create({
            data: {
              contentId: parsed.data,
              fileName: w.file.name,
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
          fileSize: Number(a.fileSize),
          mimeType: a.mimeType,
        })),
      }, { status: 201 });
    } catch (dbError) {
      // DB 트랜잭션 실패 시 디스크에 쓴 파일 전부 정리
      for (const w of writtenFiles) {
        await unlink(w.absolutePath).catch((unlinkErr) => {
          console.error("[upload-cleanup] Failed to remove file after DB error", {
            path: w.absolutePath,
            error: unlinkErr,
          });
        });
      }
      throw dbError;
    }
  } catch (error) {
    console.error("[POST /api/contents/:id/files]", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 },
    );
  }
}
