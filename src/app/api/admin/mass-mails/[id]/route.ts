import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { basename, resolve, join } from "path";
import { randomUUID } from "crypto";
import DOMPurify from "isomorphic-dompurify";

import { canModifyResource, resolveAuthorSuperAdmin, requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { validateFiles } from "@/lib/file-validation";
import { maskEmail } from "@/lib/interface-logger";
import { logError } from "@/lib/log-error";
import { cleanupAttachments, SANITIZE_CONFIG } from "@/lib/mass-mail-utils";
import type { PersistedAttachment } from "@/lib/mass-mail-utils";
import {
  classifyFailure,
  FAILED_RECIPIENTS_RESPONSE_LIMIT,
} from "@/lib/mass-mail/constants";
import { processMassMailSend } from "@/lib/mass-mail/send-processor";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import {
  massMailIdParamSchema,
  massMailCreateSchema,
  TARGET_KEYS,
  buildTargetsObject,
  buildTargetLabel,
} from "@/lib/schemas/mass-mail";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/mass-mails/:id — 상세 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인 — BULK_MAIL.read 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "read");
    if (authResult instanceof NextResponse) return authResult;

    // 2. ID 파라미터 검증
    const { id: rawId } = await params;
    const idResult = massMailIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    // 3. 조회 — 첨부파일 + 失敗確認 모달용 failed recipients 포함.
    //    PII / 응답크기 보호:
    //    - failed recipients 는 take: FAILED_RECIPIENTS_RESPONSE_LIMIT (500) 으로 상한.
    //    - 전수 export 가 필요하면 감사로그 기반 별도 엔드포인트로 분리해야 함 (TODO).
    //    - email 은 마스킹, errorMessage 는 분류 코드로 치환 — 인프라 지문/주소록 덤프 risk 완화.
    const mail = await prisma.massMail.findUnique({
      where: { id: idResult.data },
      include: {
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
          },
          orderBy: { id: "asc" },
        },
        recipients: {
          where: { status: "failed" },
          select: {
            email: true,
            userName: true,
            authRole: true,
            errorMessage: true,
            sentAt: true,
          },
          orderBy: { id: "asc" },
          take: FAILED_RECIPIENTS_RESPONSE_LIMIT,
        },
      },
    });

    if (!mail) {
      return NextResponse.json(
        { error: "メールが見つかりません" },
        { status: 404 },
      );
    }

    const failedTotal = mail.sentFailed;
    const failedTruncated = failedTotal > mail.recipients.length;

    // 작성자가 SUPER_ADMIN 인지 — 프론트 수정/삭제 버튼 노출 판단용
    // resolveAuthorSuperAdmin 은 내부에서 에러를 흡수하고 status=unknown + fail-closed(true) 로 수렴 — 호출부 try/catch 불필요
    const authorResult = await resolveAuthorSuperAdmin({
      userType: mail.userType,
      userId: mail.userId,
    });
    const authorIsSuperAdmin = authorResult.isSuperAdmin;

    // 4. 발송대상 매핑 (공통 유틸 사용)
    // 5. 응답 매핑
    const mapped = {
      id: mail.id,
      senderName: mail.senderName,
      targets: buildTargetsObject(mail),
      targetsLabel: buildTargetLabel(mail),
      optOut: mail.optOut,
      subject: mail.subject,
      body: mail.body,
      status: mail.status,
      sentAt: mail.sentAt?.toISOString() ?? null,
      sentTotal: mail.sentTotal,
      sentSuccess: mail.sentSuccess,
      sentFailed: mail.sentFailed,
      userType: mail.userType,
      userId: mail.userId,
      authorIsSuperAdmin,
      attachments: mail.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize !== null ? Number(a.fileSize) : null,
      })),
      // 失敗확인 모달용 — sent_failed=0 이면 빈 배열, 상한 초과 시 truncated=true.
      // email 마스킹 + errorCategory 로 PII / 인프라 지문 노출 차단.
      failedRecipients: mail.recipients.map((r) => ({
        email: maskEmail(r.email),
        userName: r.userName,
        authRole: r.authRole,
        errorCategory: classifyFailure(r.errorMessage),
        lastAttemptAt: r.sentAt?.toISOString() ?? null,
      })),
      failedRecipientsTotal: failedTotal,
      failedRecipientsTruncated: failedTruncated,
      createdBy: mail.createdBy ?? "",
      createdAt: mail.createdAt.toISOString(),
    };

    console.log(`[GET /api/admin/mass-mails/:id] 대량메일 상세 조회 — id: ${mail.id}, userId: ${authResult.user.userId}`);

    return NextResponse.json(
      { data: mapped },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    logError("GET /api/admin/mass-mails/:id", error);
    return NextResponse.json(
      { error: "メール詳細の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/mass-mails/:id — 대량메일 단건 삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인 — BULK_MAIL.delete 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "delete");
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. ID 파라미터 검증
    const { id: rawId } = await params;
    const idResult = massMailIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    // 3. 첨부파일 경로 조회 (디스크 정리용)
    const mail = await prisma.massMail.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        userType: true,
        userId: true,
        status: true,
        attachments: { select: { filePath: true } },
      },
    });

    if (!mail) {
      return NextResponse.json(
        { error: "メールが見つかりません" },
        { status: 404 },
      );
    }

    // 소유권 검증: SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
    // retry 핸들러와 동일하게 ownership → status 순서로 체크 — 타인 소유 메일의 상태 enumeration 차단
    if (!(await canModifyResource(user, mail))) {
      return NextResponse.json(
        { error: "このメールを削除する権限がありません" },
        { status: 403 },
      );
    }

    // 발송된 메일은 삭제 불가 — 下書き(draft)만 허용
    if (mail.status !== "draft") {
      return NextResponse.json(
        { error: "下書き以外のメールは削除できません" },
        { status: 400 },
      );
    }

    // 4. DB 삭제 (Cascade로 첨부파일 레코드도 삭제)
    await prisma.massMail.delete({ where: { id: idResult.data } });

    // 5. 첨부파일 디스크 정리 (DB 삭제 성공 후 — best-effort)
    for (const att of mail.attachments) {
      const absPath = resolve(UPLOAD_DIR, att.filePath);
      if (!isInsideDir(absPath, UPLOAD_DIR)) {
        console.error("[DELETE /api/admin/mass-mails/:id] Path Traversal 차단:", att.filePath);
        continue;
      }
      await unlink(absPath).catch((e: unknown) => {
        console.warn("[DELETE /api/admin/mass-mails/:id] 첨부파일 삭제 실패:", att.filePath, e);
      });
    }

    console.log(`[DELETE /api/admin/mass-mails/:id] 대량메일 삭제 완료 — id: ${mail.id}, userId: ${authResult.user.userId}`);

    return NextResponse.json({ data: { id: idResult.data } });
  } catch (error: unknown) {
    logError("DELETE /api/admin/mass-mails/:id", error);
    return NextResponse.json(
      { error: "メールの削除に失敗しました" },
      { status: 500 },
    );
  }
}

// ─── PUT /api/admin/mass-mails/:id — 대량메일 수정 (multipart/form-data) ───

const MAX_FILES = 10;
const LOG_TAG_PUT = "PUT /api/admin/mass-mails/:id";

export async function PUT(request: NextRequest, { params }: Params) {
  let writtenFiles: PersistedAttachment[] = [];
  let uploadDir: string | undefined;

  try {
    // 1. 관리자 권한 확인 — BULK_MAIL.update 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "update");
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. ID 파라미터 검증
    const { id: rawId } = await params;
    const idResult = massMailIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    // 3. 기존 레코드 확인 (draft만 수정 가능)
    const existing = await prisma.massMail.findUnique({
      where: { id: idResult.data },
      include: {
        attachments: { select: { id: true, filePath: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "メールが見つかりません" },
        { status: 404 },
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "下書き以外のメールは編集できません" },
        { status: 400 },
      );
    }

    // 소유권 검증: SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
    if (!(await canModifyResource(user, existing))) {
      return NextResponse.json(
        { error: "このメールを編集する権限がありません" },
        { status: 403 },
      );
    }

    // 4. FormData 파싱
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error: unknown) {
      console.warn("[PUT /api/admin/mass-mails/:id] FormData 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        fields[key] = value;
      }
    }

    const result = massMailCreateSchema.safeParse(fields);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "入力内容に不備があります",
          details: result.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const data = result.data;
    const hasTarget = TARGET_KEYS.some((k) => data[k] === true);
    if (!hasTarget) {
      return NextResponse.json(
        { error: "送信先を1つ以上選択してください" },
        { status: 400 },
      );
    }

    // 시공점(SEKO) 발송 미지원 — AS-IS API 미확보 (조용한 스킵 금지, 명시적 거부)
    if (data.targetConstructor) {
      return NextResponse.json(
        { error: "施工店(SEKO)向け一括送信は現在対応していません" },
        { status: 400 },
      );
    }

    // 5. 첨부파일 검증
    const rawFiles = formData.getAll("files");
    const newFiles = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

    // 삭제할 기존 첨부파일 ID 목록 (프론트에서 JSON 배열 문자열로 전달)
    const deleteIdsRaw = fields.deleteAttachmentIds;
    let deleteAttachmentIds: number[] = [];
    if (deleteIdsRaw) {
      try {
        const parsed = JSON.parse(deleteIdsRaw);
        if (Array.isArray(parsed)) {
          deleteAttachmentIds = parsed.filter((id): id is number => typeof id === "number" && Number.isInteger(id));
        }
      } catch (e: unknown) {
        console.warn("[PUT /api/admin/mass-mails/:id] deleteAttachmentIds JSON 파싱 실패 — 삭제 무시:", deleteIdsRaw, e);
      }
    }

    // 중복 제거 + 실제 존재하는 첨부파일 ID만 필터링 (중복 ID로 keepCount 음수 방지)
    const uniqueDeleteIds = new Set(deleteAttachmentIds);
    const validDeleteIds = existing.attachments
      .filter((a) => uniqueDeleteIds.has(a.id))
      .map((a) => a.id);
    const keepCount = existing.attachments.length - validDeleteIds.length;
    if (keepCount + newFiles.length > MAX_FILES) {
      return NextResponse.json(
        { error: `添付ファイルは${MAX_FILES}件以内にしてください` },
        { status: 400 },
      );
    }

    if (newFiles.length > 0) {
      const validation = validateFiles(newFiles);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    // 6. HTML body sanitization (공통 화이트리스트 설정 사용)
    const sanitizedBody = DOMPurify.sanitize(data.body, SANITIZE_CONFIG);

    if (!sanitizedBody.trim()) {
      return NextResponse.json(
        { error: "本文の内容が無効です" },
        { status: 400 },
      );
    }

    // 7. 신규 첨부파일 디스크 기록
    if (newFiles.length > 0) {
      const tempId = randomUUID();
      uploadDir = join(UPLOAD_DIR, "mass-mails", tempId);
      await mkdir(uploadDir, { recursive: true });
      const uploadDirAbs = resolve(uploadDir);

      const writeResults = await Promise.all(newFiles.map(async (file) => {
        const sanitizedName = basename(file.name);
        const lastDot = sanitizedName.lastIndexOf(".");
        const ext = lastDot > 0
          ? sanitizedName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
          : "";
        const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
        const filePath = `mass-mails/${tempId}/${safeFileName}`;
        const absolutePath = resolve(uploadDir!, safeFileName);

        if (!isInsideDir(absolutePath, uploadDirAbs)) {
          console.error("[PUT /api/admin/mass-mails/:id] PATH TRAVERSAL 감지:", { fileName: file.name });
          return { error: true as const };
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(absolutePath, buffer);
        return { error: false as const, absolutePath, file, filePath };
      }));

      const successes = writeResults.filter((r): r is PersistedAttachment & { error: false } => !r.error);
      writtenFiles = successes;

      if (writeResults.some((r) => r.error)) {
        await cleanupAttachments(writtenFiles, LOG_TAG_PUT, uploadDir);
        return NextResponse.json({ error: "ファイル名が正しくありません" }, { status: 400 });
      }
    }

    // 8. DB 업데이트 (트랜잭션)
    try {
      await prisma.$transaction(async (tx) => {
        // 기존 첨부파일 삭제
        if (validDeleteIds.length > 0) {
          await tx.massMailAttachment.deleteMany({
            where: {
              id: { in: validDeleteIds },
              massMailId: idResult.data,
            },
          });
        }

        // 메일 본문 업데이트 (낙관적 락: status=draft 조건으로 TOCTOU 방어)
        const updated = await tx.massMail.updateMany({
          where: { id: idResult.data, status: "draft" },
          data: {
            senderName: data.senderName,
            targetSuperAdmin: data.targetSuperAdmin,
            targetAdmin: data.targetAdmin,
            targetFirstStore: data.targetFirstStore,
            targetSecondStore: data.targetSecondStore,
            targetConstructor: data.targetConstructor,
            targetGeneral: data.targetGeneral,
            optOut: data.optOut,
            subject: data.subject,
            body: sanitizedBody,
            status: data.status,
            updatedBy: user.userId,
          },
        });
        if (updated.count === 0) {
          throw new Error("NOT_DRAFT_ANYMORE");
        }

        // 신규 첨부파일 레코드 추가
        if (writtenFiles.length > 0) {
          await tx.massMailAttachment.createMany({
            data: writtenFiles.map((w) => ({
              massMailId: idResult.data,
              fileName: basename(w.file.name),
              filePath: w.filePath,
              fileSize: BigInt(w.file.size),
              createdBy: user.userId,
              updatedBy: user.userId,
            })),
          });
        }
      });
    } catch (dbError: unknown) {
      await cleanupAttachments(writtenFiles, LOG_TAG_PUT, uploadDir);
      writtenFiles = [];
      uploadDir = undefined;
      throw dbError;
    }

    // 9. 삭제 첨부파일 디스크 정리 (best-effort)
    if (validDeleteIds.length > 0) {
      const toDelete = existing.attachments.filter((a) => validDeleteIds.includes(a.id));
      for (const att of toDelete) {
        const absPath = resolve(UPLOAD_DIR, att.filePath);
        if (!isInsideDir(absPath, UPLOAD_DIR)) continue;
        await unlink(absPath).catch((e: unknown) => {
          console.warn("[PUT /api/admin/mass-mails/:id] 삭제 첨부파일 정리 실패:", att.filePath, e);
        });
      }
    }

    const statusMsg = data.status === "pending"
      ? "メール送信を受け付けました。"
      : "下書きとして保存しました。";

    console.log(`[PUT /api/admin/mass-mails/:id] 대량메일 수정 완료 — id: ${idResult.data}, status: ${data.status}`);

    // 비동기 발송 트리거 (Fire-and-Forget) — draft→pending 전이 시.
    // processMassMailSend 가 자체 외부 안전망(markSendFailed best-effort) 을 가지므로 이 catch
    // 는 그조차 새어나온 catastrophic 케이스 전용 — CRITICAL 마커로 알람 가능성 표시.
    if (data.status === "pending") {
      processMassMailSend({ massMailId: idResult.data }).catch((err: unknown) => {
        console.error(
          `[PUT /api/admin/mass-mails/:id] CRITICAL — 비동기 발송 fire-and-forget 새어남 (markSendFailed 마저 실패). 좀비 감지 의존. massMailId: ${idResult.data}`,
          err,
        );
      });
    }

    return NextResponse.json({
      data: { id: idResult.data, status: data.status, message: statusMsg },
    });
  } catch (error: unknown) {
    await cleanupAttachments(writtenFiles, LOG_TAG_PUT, uploadDir);
    if (error instanceof Error && error.message === "NOT_DRAFT_ANYMORE") {
      return NextResponse.json(
        { error: "このメールは既に下書き状態ではないため、編集できません" },
        { status: 409 },
      );
    }
    logError("PUT /api/admin/mass-mails/:id", error);
    return NextResponse.json(
      { error: "メールの更新に失敗しました" },
      { status: 500 },
    );
  }
}
