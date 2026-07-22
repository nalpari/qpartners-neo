import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { basename, resolve, join } from "path";
import { randomUUID } from "crypto";

import { canModifyResource, resolveActiveRoleCodes, resolveAuthorSuperAdmin, requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, isLegacyOfficeOLE2, validateFiles } from "@/lib/file-validation";
import { maskEmail } from "@/lib/interface-logger";
import { logError } from "@/lib/log-error";
import { cleanupAttachments } from "@/lib/mass-mail-utils";
import type { PersistedAttachment } from "@/lib/mass-mail-utils";
import { sanitizeContentHtml } from "@/lib/rich-editor/sanitize-html";
import {
  classifyFailure,
  FAILED_RECIPIENTS_RESPONSE_LIMIT,
} from "@/lib/mass-mail/constants";
import { processMassMailSend } from "@/lib/mass-mail/send-processor";
import { resolveSendSchedule, STATUS_SAVE_MESSAGE } from "@/lib/mass-mail/schedule";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import {
  massMailIdParamSchema,
  massMailCreateSchema,
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
        targets: {
          select: { roleCode: true },
        },
        recipients: {
          where: { status: "failed" },
          select: {
            email: true,
            userName: true,
            authRoleCode: true,
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

    // 편집 가능 여부(서버 시간 기준) — draft 또는 미도래 예약(scheduled + scheduledSendAt>now).
    // 클라이언트에서 Date.now() 를 render 중 호출하지 않도록(React Compiler purity) 서버가 진입 시점 기준으로 산출.
    // 저장 시점 재검증은 PUT 낙관적 락이 담당.
    const editable =
      mail.status === "draft" ||
      (mail.status === "scheduled" &&
        mail.scheduledSendAt !== null &&
        mail.scheduledSendAt.getTime() > Date.now());

    // 4. 발송대상 매핑 (공통 유틸 사용)
    // 5. 응답 매핑
    const mapped = {
      id: mail.id,
      senderName: mail.senderName,
      /** 게시대상 권한코드 배열 — FE 가 useTargetLabels 로 라벨링 */
      targetRoleCodes: mail.targets.map((t) => t.roleCode),
      optOut: mail.optOut,
      subject: mail.subject,
      body: mail.body,
      status: mail.status,
      scheduledSendAt: mail.scheduledSendAt?.toISOString() ?? null,
      editable,
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
        authRoleCode: r.authRoleCode,
        errorCategory: classifyFailure(r.errorMessage),
        lastAttemptAt: r.sentAt?.toISOString() ?? null,
      })),
      failedRecipientsTotal: failedTotal,
      failedRecipientsTruncated: failedTruncated,
      createdBy: mail.createdBy ?? "",
      createdByName: mail.createdByName ?? null,
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
        scheduledSendAt: true,
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

    // 삭제(예약취소) 허용: 下書き(draft) 또는 미도래 예약(scheduled + scheduledSendAt>now)만.
    // 발송된/발송 중/도래한 메일은 삭제 불가.
    const now = new Date();
    const deletable =
      mail.status === "draft" ||
      (mail.status === "scheduled" &&
        mail.scheduledSendAt !== null &&
        mail.scheduledSendAt.getTime() > now.getTime());
    if (!deletable) {
      return NextResponse.json(
        { error: "下書きまたは予約(未送信)のメールのみ削除できます" },
        { status: 400 },
      );
    }

    // 4. DB 삭제 (Cascade로 첨부파일 레코드도 삭제).
    //    낙관적 조건 — 검사 후 삭제 사이에 예약이 도래해 배치가 발송을 시작하는 race 차단.
    const deleted = await prisma.massMail.deleteMany({
      where: {
        id: idResult.data,
        OR: [
          { status: "draft" },
          { status: "scheduled", scheduledSendAt: { gt: now } },
        ],
      },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: "現在の状態では削除できません" },
        { status: 409 },
      );
    }

    // 5. 첨부파일 디스크 정리 (DB 삭제 성공 후 — best-effort)
    // contents 라우트와 동일하게 비교 대상 디렉토리를 resolve() 절대경로화 — 상대경로/심볼릭 링크 환경 false negative 방지.
    const uploadRoot = resolve(UPLOAD_DIR);
    for (const att of mail.attachments) {
      const absPath = resolve(UPLOAD_DIR, att.filePath);
      if (!isInsideDir(absPath, uploadRoot)) {
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

const LOG_TAG_PUT = "PUT /api/admin/mass-mails/:id";

export async function PUT(request: NextRequest, { params }: Params) {
  let writtenFiles: PersistedAttachment[] = [];
  let uploadDir: string | undefined;

  try {
    // 1. 관리자 권한 확인 — BULK_MAIL.update 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "update");
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 1-1. Content-Length 사전 차단 — FormData 파싱 전 대용량 body 거부 (POST 와 동일 정책).
    const rawContentLength = request.headers.get("content-length");
    if (rawContentLength === null) {
      console.warn("[PUT /api/admin/mass-mails/:id] Content-Length 누락 — chunked encoding 거부");
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
    // 메일 첨부 합계 50MB 정책 + multipart boundary/헤더 오버헤드 여유 10MB.
    const MAX_BATCH_SIZE = MAX_FILE_SIZE + 10 * 1024 * 1024;
    if (contentLength > MAX_BATCH_SIZE) {
      console.warn("[PUT /api/admin/mass-mails/:id] Content-Length 초과:", contentLength);
      return NextResponse.json(
        { error: "リクエストサイズが大きすぎます" },
        { status: 413 },
      );
    }

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
        attachments: { select: { id: true, filePath: true, fileSize: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "メールが見つかりません" },
        { status: 404 },
      );
    }

    // 편집 허용: 下書き(draft) 또는 미도래 예약(scheduled + scheduledSendAt>now)만.
    // 진입 시점엔 미도래라 편집 가능해도, 저장 시점 도래 시 아래 낙관적 락이 409 로 차단.
    const now = new Date();
    const isEditable =
      existing.status === "draft" ||
      (existing.status === "scheduled" &&
        existing.scheduledSendAt !== null &&
        existing.scheduledSendAt.getTime() > now.getTime());
    if (!isEditable) {
      return NextResponse.json(
        { error: "下書きまたは予約(未送信)のメールのみ編集できます" },
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

    // targetRoleCodes DB 활성 검증 — 비활성/미존재 권한코드 차단
    const activeRoles = await resolveActiveRoleCodes();
    const inactiveRoles = data.targetRoleCodes.filter((c) => !activeRoles.has(c));
    if (inactiveRoles.length > 0) {
      return NextResponse.json(
        { error: "無効な権限コードが含まれています", invalidRoleCodes: inactiveRoles },
        { status: 400 },
      );
    }

    // 시공점(SEKO) 발송 미지원 — AS-IS API 미확보 (조용한 스킵 금지, 명시적 거부)
    if (data.targetRoleCodes.includes("SEKO")) {
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

    // 중복 제거 + 실제 존재하는 첨부파일 ID만 필터링 (잔존 첨부 합계 계산·삭제 처리 정확성 보장)
    const uniqueDeleteIds = new Set(deleteAttachmentIds);
    const validDeleteIds = existing.attachments
      .filter((a) => uniqueDeleteIds.has(a.id))
      .map((a) => a.id);
    const validDeleteSet = new Set(validDeleteIds);

    if (newFiles.length > 0) {
      // 메일 정책 — 콘텐츠보다 좁은 화이트리스트 (수신자 보호: 동영상/압축/한글 등 제외).
      const validation = validateFiles(newFiles, "mail");
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    // 합계 용량 검증 — 유지되는 기존 첨부 + 신규 업로드 합계 ≤ MAX_FILE_SIZE (콘텐츠 첨부와 동일 정책).
    // fileSize 는 Prisma BigInt nullable → Number 변환, null 은 0 으로 방어.
    const keptBytes = existing.attachments
      .filter((a) => !validDeleteSet.has(a.id))
      .reduce((sum, a) => sum + (a.fileSize !== null ? Number(a.fileSize) : 0), 0);
    const incomingBytes = newFiles.reduce((sum, f) => sum + f.size, 0);
    if (keptBytes + incomingBytes > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `添付ファイルの合計容量が${MAX_FILE_SIZE_MB}MBを超えています` },
        { status: 400 },
      );
    }

    // 6. HTML body sanitization (공통 화이트리스트 설정 사용)
    // RichEditor 출력(color/font-size span, mark/highlight, table 등)을 보존하기 위해
    // FE 의 표준 sanitizer 사용. 메일 본문도 contents 와 동일한 화이트리스트를 통과.
    const sanitizedBody = sanitizeContentHtml(data.body);

    if (!sanitizedBody.trim()) {
      return NextResponse.json(
        { error: "本文の内容が無効です" },
        { status: 400 },
      );
    }

    // 즉시/예약/초안 파생 — 무효 예약(과거/현재)은 첨부 기록 전에 400 으로 차단.
    const schedule = resolveSendSchedule(data.status, data.scheduledSendAt, now);
    if (!schedule.ok) {
      return NextResponse.json(
        { error: "未来の日時を選択してください" },
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
        // Legacy Office (OLE2) 감지 — 매크로 유무는 stream 분석 필요. 감사 로깅만 수행 (차단 X).
        // contents 라우트와 동일 정책 (PR #222 HIGH) — xls/ppt 허용 시 추적 가능성 확보.
        const head = new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(8, buffer.byteLength));
        if (isLegacyOfficeOLE2(head)) {
          console.warn("[PUT /api/admin/mass-mails/:id] Legacy Office OLE2 감지 — 매크로 가능성 추적:", {
            fileName: file.name,
            size: file.size,
          });
        }
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
          where: {
            id: idResult.data,
            OR: [
              { status: "draft" },
              { status: "scheduled", scheduledSendAt: { gt: now } },
            ],
          },
          data: {
            senderName: data.senderName,
            optOut: data.optOut,
            subject: data.subject,
            body: sanitizedBody,
            status: schedule.status,
            scheduledSendAt: schedule.scheduledSendAt,
            createdBy: user.userId,
            createdByName: user.name ?? null,
            updatedBy: user.userId,
          },
        });
        if (updated.count === 0) {
          throw new Error("NOT_EDITABLE");
        }

        // MassMailTarget 갱신 — 전체 삭제 후 재생성 (Target Dynamic from Role)
        await tx.massMailTarget.deleteMany({
          where: { massMailId: idResult.data },
        });
        await tx.massMailTarget.createMany({
          data: data.targetRoleCodes.map((code) => ({
            massMailId: idResult.data,
            roleCode: code,
          })),
        });

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
    // contents 라우트와 동일하게 비교 대상 디렉토리를 resolve() 절대경로화.
    if (validDeleteIds.length > 0) {
      const uploadRoot = resolve(UPLOAD_DIR);
      const toDelete = existing.attachments.filter((a) => validDeleteIds.includes(a.id));
      for (const att of toDelete) {
        const absPath = resolve(UPLOAD_DIR, att.filePath);
        if (!isInsideDir(absPath, uploadRoot)) continue;
        await unlink(absPath).catch((e: unknown) => {
          console.warn("[PUT /api/admin/mass-mails/:id] 삭제 첨부파일 정리 실패:", att.filePath, e);
        });
      }
    }

    const statusMsg = STATUS_SAVE_MESSAGE[schedule.status];

    console.log(`[PUT /api/admin/mass-mails/:id] 대량메일 수정 완료 — id: ${idResult.data}, status: ${schedule.status}`);

    // 비동기 발송 트리거 (Fire-and-Forget) — 즉시발송 전이 시(draft/scheduled→pending).
    // 예약(scheduled) 저장은 트리거하지 않고 배치가 도래 시 발송한다.
    // processMassMailSend 가 자체 외부 안전망(markSendFailed best-effort) 을 가지므로 이 catch
    // 는 그조차 새어나온 catastrophic 케이스 전용 — CRITICAL 마커로 알람 가능성 표시.
    if (schedule.triggerSend) {
      processMassMailSend({ massMailId: idResult.data }).catch((err: unknown) => {
        console.error(
          `[PUT /api/admin/mass-mails/:id] CRITICAL — 비동기 발송 fire-and-forget 새어남 (markSendFailed 마저 실패). 좀비 감지 의존. massMailId: ${idResult.data}`,
          err,
        );
      });
    }

    return NextResponse.json({
      data: { id: idResult.data, status: schedule.status, message: statusMsg },
    });
  } catch (error: unknown) {
    await cleanupAttachments(writtenFiles, LOG_TAG_PUT, uploadDir);
    if (error instanceof Error && error.message === "NOT_EDITABLE") {
      return NextResponse.json(
        { error: "このメールは編集可能な状態ではないため、編集できません" },
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
