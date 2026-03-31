import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
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

    const formData = await request.formData();
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
    // 허용 확장자 (MIME 검증과 이중 체크)
    const ALLOWED_EXTENSIONS = new Set([
      "pdf", "docx", "xlsx", "pptx",
      "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp",
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

    const uploadDir = join(
      process.cwd(),
      "public",
      "uploads",
      "contents",
      String(parsed.data),
    );
    await mkdir(uploadDir, { recursive: true });

    const attachments = [];

    for (const file of files) {
      const ext = basename(file.name).split(".").pop() ?? "";
      const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
      const filePath = `/uploads/contents/${parsed.data}/${safeFileName}`;
      const absolutePath = resolve(uploadDir, safeFileName);

      // path traversal 방어: 업로드 디렉토리 내부인지 검증
      if (!absolutePath.startsWith(resolve(uploadDir))) {
        return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(absolutePath, buffer);

      const attachment = await prisma.contentAttachment.create({
        data: {
          contentId: parsed.data,
          fileName: file.name,
          filePath,
          fileSize: BigInt(file.size),
          mimeType: file.type || null,
          createdBy: user.userId,
        },
      });

      attachments.push({
        id: attachment.id,
        fileName: attachment.fileName,
        fileSize: Number(attachment.fileSize),
        mimeType: attachment.mimeType,
      });
    }

    return NextResponse.json({ data: attachments }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contents/:id/files]", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 },
    );
  }
}
