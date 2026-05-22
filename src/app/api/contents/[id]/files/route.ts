import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, basename, relative, resolve } from "path";
import { randomUUID } from "crypto";

import { canModifyResource, requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import {
  isLegacyOfficeOLE2,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  validateFiles,
} from "@/lib/file-validation";
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
    // 정책: 콘텐츠 첨부 합계 50MB. multipart boundary/헤더 오버헤드 여유 10MB → 60MB 한도.
    //       next.config.ts proxyClientMaxBodySize 와 동일 값으로 일관화.
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
    const MAX_BATCH_SIZE = MAX_FILE_SIZE + 10 * 1024 * 1024; // 50MB 정책 + 10MB 오버헤드 여유
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

    // 콘텐츠 첨부 합계 용량 검증 — 기존 저장 첨부 + 신규 업로드 ≤ MAX_FILE_SIZE.
    // FE 와 동일 정책. (트랜잭션 외부 사전 검증 — TOCTOU race 의도적 soft cap)
    //
    // TOCTOU 정책:
    //  - aggregate → write 사이 동시 요청 N 개 통과 시 최대 N × MAX_FILE_SIZE 저장 가능
    //  - 50MB · 단일 콘텐츠 단위 한도이며 운영 모니터링으로 보완 (별도 정책 문서 참조)
    //  - 엄격 격리가 필요하면 Serializable transaction + SELECT FOR UPDATE 로 격상
    const existingAgg = await prisma.contentAttachment.aggregate({
      _sum: { fileSize: true },
      where: { contentId: parsed.data },
    });
    const existingBytes = existingAgg._sum.fileSize !== null ? Number(existingAgg._sum.fileSize) : 0;
    const incomingBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (existingBytes + incomingBytes > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `添付ファイルの合計容量が${MAX_FILE_SIZE_MB}MBを超えています` },
        { status: 400 },
      );
    }

    // public/ 외부에 저장 → 다운로드 API를 통해서만 접근 가능
    const uploadDir = join(UPLOAD_DIR, "contents", String(parsed.data));
    await mkdir(uploadDir, { recursive: true });
    const uploadDirAbsolute = resolve(uploadDir);

    // 1단계: 모든 파일을 디스크에 기록 + OLE2 magic-byte 동시 감지 (arrayBuffer 1회 read 로 통합).
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
      // Legacy Office (OLE2) 감지 — 매크로 유무는 stream 분석 필요. 감사 로깅만 수행 (차단 X).
      const head = new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(8, buffer.byteLength));
      if (isLegacyOfficeOLE2(head)) {
        console.warn("[POST /api/contents/:id/files] Legacy Office OLE2 감지 — 매크로 가능성 추적:", {
          fileName: file.name,
          size: file.size,
          contentId: parsed.data,
        });
      }
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
