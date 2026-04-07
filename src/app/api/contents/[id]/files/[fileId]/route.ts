import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join, basename, resolve } from "path";
import { randomUUID } from "crypto";

import { canModifyContent, requireAdmin } from "@/lib/auth";
import { validateFile } from "@/lib/file-validation";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string; fileId: string }> };

// DELETE /api/contents/:id/files/:fileId — 첨부파일 삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    const { id, fileId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    const parsedFileId = idParamSchema.safeParse(fileId);

    if (!parsedId.success || !parsedFileId.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 콘텐츠 존재 + 수정 권한 확인
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      select: { id: true, status: true, userId: true, authorDepartment: true },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canModifyContent(user, content)) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다" },
        { status: 403 },
      );
    }

    // 첨부파일 조회
    const attachment = await prisma.contentAttachment.findFirst({
      where: { id: parsedFileId.data, contentId: parsedId.data },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "첨부파일을 찾을 수 없습니다" },
        { status: 404 },
      );
    }

    // DB 삭제 — FK는 onDelete: SetNull로 DownloadLog.attachmentId가 null로 변경됨
    await prisma.contentAttachment.delete({
      where: { id: parsedFileId.data },
    });

    // 디스크 파일 삭제 (실패해도 DB 삭제는 유지 — 경고 로그만)
    const absolutePath = resolve(process.cwd(), attachment.filePath);
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    if (absolutePath.startsWith(storageRoot)) {
      await unlink(absolutePath).catch((err: unknown) => {
        console.error("[DELETE /api/contents/:id/files/:fileId] 디스크 파일 삭제 실패:", {
          attachmentId: parsedFileId.data,
          error: err,
        });
      });
    } else {
      console.error("[DELETE /api/contents/:id/files/:fileId] 이상 경로 감지:", absolutePath);
    }

    console.log(`[DELETE /api/contents/:id/files/:fileId] 첨부파일 삭제 완료 — attachmentId: ${parsedFileId.data}`);

    return NextResponse.json({
      data: { message: "첨부파일을 삭제했습니다" },
    });
  } catch (error: unknown) {
    console.error("[DELETE /api/contents/:id/files/:fileId] 실패:", error);
    return NextResponse.json(
      { error: "첨부파일 삭제에 실패했습니다" },
      { status: 500 },
    );
  }
}

// PUT /api/contents/:id/files/:fileId — 첨부파일 교체 (multipart/form-data)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    const { id, fileId } = await params;
    const parsedId = idParamSchema.safeParse(id);
    const parsedFileId = idParamSchema.safeParse(fileId);

    if (!parsedId.success || !parsedFileId.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // 콘텐츠 + 기존 첨부파일 조회
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      select: { id: true, status: true, userId: true, authorDepartment: true },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canModifyContent(user, content)) {
      return NextResponse.json(
        { error: "수정 권한이 없습니다" },
        { status: 403 },
      );
    }

    const oldAttachment = await prisma.contentAttachment.findFirst({
      where: { id: parsedFileId.data, contentId: parsedId.data },
    });

    if (!oldAttachment) {
      return NextResponse.json(
        { error: "첨부파일을 찾을 수 없습니다" },
        { status: 404 },
      );
    }

    // FormData에서 새 파일 추출
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart form data" },
        { status: 400 },
      );
    }

    const rawFile = formData.get("file");
    if (!(rawFile instanceof File) || rawFile.size === 0) {
      return NextResponse.json(
        { error: "파일을 선택해주세요" },
        { status: 400 },
      );
    }

    // 파일 검증
    const validation = validateFile(rawFile);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 새 파일 저장
    const uploadDir = join(
      process.cwd(),
      "storage",
      "uploads",
      "contents",
      String(parsedId.data),
    );
    await mkdir(uploadDir, { recursive: true });

    const ext = basename(rawFile.name).split(".").pop() ?? "";
    const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
    const newFilePath = `storage/uploads/contents/${parsedId.data}/${safeFileName}`;
    const newAbsolutePath = resolve(uploadDir, safeFileName);

    if (!newAbsolutePath.startsWith(resolve(uploadDir))) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    const buffer = Buffer.from(await rawFile.arrayBuffer());
    await writeFile(newAbsolutePath, buffer);

    // DB 레코드 업데이트
    let updated;
    try {
      updated = await prisma.contentAttachment.update({
        where: { id: parsedFileId.data },
        data: {
          fileName: rawFile.name,
          filePath: newFilePath,
          fileSize: BigInt(rawFile.size),
          mimeType: rawFile.type || null,
          updatedBy: user.userId,
        },
      });
    } catch (dbError: unknown) {
      // DB 실패 시 새 파일 정리
      await unlink(newAbsolutePath).catch((err: unknown) => {
        console.error("[PUT /api/contents/:id/files/:fileId] DB 실패 후 새 파일 정리 실패:", err);
      });
      throw dbError;
    }

    // 기존 디스크 파일 삭제 (실패해도 업데이트는 유지)
    const oldAbsolutePath = resolve(process.cwd(), oldAttachment.filePath);
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    if (oldAbsolutePath.startsWith(storageRoot)) {
      await unlink(oldAbsolutePath).catch((err: unknown) => {
        console.error("[PUT /api/contents/:id/files/:fileId] 기존 파일 삭제 실패:", {
          attachmentId: parsedFileId.data,
          error: err,
        });
      });
    }

    console.log(`[PUT /api/contents/:id/files/:fileId] 첨부파일 교체 완료 — attachmentId: ${parsedFileId.data}`);

    return NextResponse.json(
      {
        data: {
          id: updated.id,
          fileName: updated.fileName,
          fileSize: updated.fileSize !== null ? Number(updated.fileSize) : null,
          mimeType: updated.mimeType,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[PUT /api/contents/:id/files/:fileId] 실패:", error);
    return NextResponse.json(
      { error: "첨부파일 교체에 실패했습니다" },
      { status: 500 },
    );
  }
}
