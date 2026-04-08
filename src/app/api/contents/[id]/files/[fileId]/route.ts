import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join, basename, resolve } from "path";
import { randomUUID } from "crypto";

import { Prisma } from "@/generated/prisma/client";

import { canModifyContent, requireAdmin } from "@/lib/auth";
import { MAX_FILE_SIZE, validateFile } from "@/lib/file-validation";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string; fileId: string }> };

// TODO(리뷰 후속 — 코드 품질): DELETE/PUT 핸들러의 인증·콘텐츠 조회·권한 검사 ~30줄이 중복됨.
//  공통 헬퍼 `resolveAttachmentOrError(request, params)` 로 추출 리팩토링 가능.
//  이번 PR은 Must-Fix 보안/버그 수정 범위로 한정하고 리팩토링은 별도 PR에서 진행 예정.
//
// TODO(리뷰 후속 — 성능): content + attachment 별도 2회 DB 조회 → Prisma 중첩 select로 1회화 가능.
//  동시 race 감지 시 에러 메시지 granularity(콘텐츠 없음/첨부 없음 분기) 설계 검토 후 반영.
//
// TODO(리뷰 후속 — 동시성): MariaDB DATETIME 기본 정밀도(초 단위)에서는 같은 초 내 동시 PUT의
//  optimistic lock(updatedAt 비교)이 감지되지 않을 수 있음. 현재는 체감 가능한 충돌 빈도가 낮아
//  우선순위가 낮지만, `@db.DateTime(3)` 로 precision 상향 + prisma db push 를 후속 PR로 진행 예정.

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
      return NextResponse.json({ error: "IDの形式が正しくありません" }, { status: 400 });
    }

    // 콘텐츠 존재 + 수정 권한 확인
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      select: { id: true, status: true, userId: true, authorDepartment: true },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    if (!canModifyContent(user, content)) {
      return NextResponse.json(
        { error: "削除する権限がありません" },
        { status: 403 },
      );
    }

    // 첨부파일 조회
    const attachment = await prisma.contentAttachment.findFirst({
      where: { id: parsedFileId.data, contentId: parsedId.data },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "添付ファイルが見つかりません" },
        { status: 404 },
      );
    }

    // DB 삭제 — FK는 onDelete: SetNull로 DownloadLog.attachmentId가 null로 변경됨
    // 동시 DELETE race: 한쪽이 먼저 삭제하면 다른 쪽은 P2025 → 404로 반환 (500 아님)
    try {
      await prisma.contentAttachment.delete({
        where: { id: parsedFileId.data },
      });
    } catch (dbError: unknown) {
      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2025"
      ) {
        console.warn("[DELETE /api/contents/:id/files/:fileId] 동시 DELETE 감지(P2025):", parsedFileId.data);
        return NextResponse.json(
          { error: "添付ファイルが見つかりません" },
          { status: 404 },
        );
      }
      throw dbError;
    }

    // 디스크 파일 삭제 (실패해도 DB 삭제는 유지 — 경고 로그만)
    // TODO: 운영 환경에서 disk orphan 누적 방지를 위해 구조화된 failed_disk_deletions 로그 또는
    //       orphan_files 테이블 도입 후 batch cleanup 별도 구현 예정 (리뷰 권장 사항)
    const absolutePath = resolve(process.cwd(), attachment.filePath);
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    if (isInsideDir(absolutePath, storageRoot)) {
      // 심볼릭 링크 방어(리뷰 권장) — symlink면 unlink 생략 (lexical 검증만으로는 불충분)
      const regular = await isRegularFile(absolutePath);
      if (!regular) {
        console.warn("[DELETE /api/contents/:id/files/:fileId] 정규 파일 아님/부재 — unlink 생략:", absolutePath);
      } else {
        await unlink(absolutePath).catch((err: unknown) => {
          console.error("[DELETE /api/contents/:id/files/:fileId] 디스크 파일 삭제 실패:", {
            attachmentId: parsedFileId.data,
            path: attachment.filePath,
            error: err,
          });
        });
      }
    } else {
      console.error("[DELETE /api/contents/:id/files/:fileId] 이상 경로 감지:", absolutePath);
    }

    console.log(`[DELETE /api/contents/:id/files/:fileId] 첨부파일 삭제 완료 — attachmentId: ${parsedFileId.data}`);

    return NextResponse.json({
      data: { message: "添付ファイルを削除しました" },
    });
  } catch (error: unknown) {
    console.error("[DELETE /api/contents/:id/files/:fileId] 실패:", error);
    return NextResponse.json(
      { error: "添付ファイルの削除に失敗しました" },
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
      return NextResponse.json({ error: "IDの形式が正しくありません" }, { status: 400 });
    }

    // Body size 사전 차단 — formData() 호출 전 Content-Length 확인 (DoS 방어)
    // MF-1 대응: Content-Length 누락(chunked transfer encoding) 시 formData()가 무제한
    //            바디를 메모리에 버퍼링해 OOM을 유발할 수 있음. 헤더가 없는 요청은 411로 거부.
    //            (fast-path: 리버스 프록시에서도 body size limit를 두는 것이 최종 방어선)
    const rawContentLength = request.headers.get("content-length");
    if (rawContentLength === null) {
      console.warn("[PUT /api/contents/:id/files/:fileId] Content-Length 누락 — chunked encoding 거부");
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
    if (contentLength > MAX_FILE_SIZE + 1024 * 1024) { // 50MB + 1MB 헤더 여유
      console.warn("[PUT /api/contents/:id/files/:fileId] Content-Length 초과:", contentLength);
      return NextResponse.json(
        { error: "リクエストサイズが大きすぎます" },
        { status: 413 },
      );
    }

    // 콘텐츠 + 기존 첨부파일 조회
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      select: { id: true, status: true, userId: true, authorDepartment: true },
    });

    if (!content || content.status === "deleted") {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    if (!canModifyContent(user, content)) {
      return NextResponse.json(
        { error: "編集する権限がありません" },
        { status: 403 },
      );
    }

    const oldAttachment = await prisma.contentAttachment.findFirst({
      where: { id: parsedFileId.data, contentId: parsedId.data },
    });

    if (!oldAttachment) {
      return NextResponse.json(
        { error: "添付ファイルが見つかりません" },
        { status: 404 },
      );
    }

    // FormData에서 새 파일 추출
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formError: unknown) {
      console.warn("[PUT /api/contents/:id/files/:fileId] multipart 파싱 실패:", formError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const rawFile = formData.get("file");
    if (!(rawFile instanceof File) || rawFile.size === 0) {
      return NextResponse.json(
        { error: "ファイルを選択してください" },
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
    const uploadDirAbsolute = resolve(uploadDir);

    // basename으로 path 컴포넌트 제거 (Zip Slip 방어 — DB 저장값에서 ../ 제거)
    const sanitizedName = basename(rawFile.name);
    // 리뷰 대응: 확장자 소문자 통일 — `.PDF` 등 대소문자 혼재 방지
    const ext = (sanitizedName.split(".").pop() ?? "").toLowerCase();
    const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
    const newFilePath = `storage/uploads/contents/${parsedId.data}/${safeFileName}`;
    const newAbsolutePath = resolve(uploadDir, safeFileName);

    // path traversal 방어 — relative 기반 검증 (startsWith prefix bug 회피)
    if (!isInsideDir(newAbsolutePath, uploadDirAbsolute)) {
      return NextResponse.json({ error: "ファイル名が正しくありません" }, { status: 400 });
    }

    const buffer = Buffer.from(await rawFile.arrayBuffer());
    await writeFile(newAbsolutePath, buffer);

    // DB 레코드 업데이트 — Optimistic lock으로 동시성 race 방어
    // (ContentAttachment.updatedAt @updatedAt 활용)
    // 동시 PUT 시 패배한 요청은 P2025 발생 → 새 파일 cleanup 후 409 응답
    let updated;
    try {
      updated = await prisma.contentAttachment.update({
        where: {
          id: parsedFileId.data,
          updatedAt: oldAttachment.updatedAt, // 옵티미스틱 락 키
        },
        data: {
          fileName: sanitizedName, // basename 적용된 이름만 저장 (../  제거 — Zip Slip 방어)
          filePath: newFilePath,
          fileSize: BigInt(rawFile.size),
          mimeType: rawFile.type || null,
          updatedBy: user.userId,
        },
      });
    } catch (dbError: unknown) {
      // 새 파일 정리
      await unlink(newAbsolutePath).catch((err: unknown) => {
        console.error("[PUT /api/contents/:id/files/:fileId] DB 실패 후 새 파일 정리 실패:", err);
      });

      // P2025 (record not found): 옵티미스틱 락 패배 → 409 Conflict
      if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === "P2025") {
        console.warn("[PUT /api/contents/:id/files/:fileId] 동시성 race 감지 (P2025):", parsedFileId.data);
        return NextResponse.json(
          { error: "他のリクエストにより添付ファイルが変更されました。再度お試しください" },
          { status: 409 },
        );
      }
      throw dbError;
    }

    // 기존 디스크 파일 삭제 (실패해도 업데이트는 유지)
    const oldAbsolutePath = resolve(process.cwd(), oldAttachment.filePath);
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    if (isInsideDir(oldAbsolutePath, storageRoot)) {
      // 심볼릭 링크 방어(리뷰 권장) — symlink면 unlink 생략
      const regular = await isRegularFile(oldAbsolutePath);
      if (!regular) {
        console.warn("[PUT /api/contents/:id/files/:fileId] 기존 파일이 정규 파일 아님/부재 — unlink 생략:", oldAbsolutePath);
      } else {
        await unlink(oldAbsolutePath).catch((err: unknown) => {
          console.error("[PUT /api/contents/:id/files/:fileId] 기존 파일 삭제 실패:", {
            attachmentId: parsedFileId.data,
            path: oldAttachment.filePath,
            error: err,
          });
        });
      }
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
      { status: 200 }, // PUT은 기존 리소스 교체이므로 200 (201은 신규 생성)
    );
  } catch (error: unknown) {
    console.error("[PUT /api/contents/:id/files/:fileId] 실패:", error);
    return NextResponse.json(
      { error: "添付ファイルの差し替えに失敗しました" },
      { status: 500 },
    );
  }
}
