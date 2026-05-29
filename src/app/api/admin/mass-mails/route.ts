import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, rm } from "fs/promises";
import { join, basename, resolve } from "path";
import { randomUUID } from "crypto";

import { requireMenuPermission, resolveActiveRoleCodes } from "@/lib/auth";
import type { UserInfo } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, isLegacyOfficeOLE2, validateFiles } from "@/lib/file-validation";
import { logError } from "@/lib/log-error";
import { cleanupAttachments } from "@/lib/mass-mail-utils";
import type { PersistedAttachment } from "@/lib/mass-mail-utils";
import { sanitizeContentHtml } from "@/lib/rich-editor/sanitize-html";
import { processMassMailSend } from "@/lib/mass-mail/send-processor";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { userTpSchema } from "@/lib/schemas/common";
import {
  massMailListQuerySchema,
  massMailCreateSchema,
} from "@/lib/schemas/mass-mail";
import type { Prisma } from "@/generated/prisma/client";

const ROLE_CODE_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;

/** UserInfo → DB enum 매핑 — 미지의 userType은 에러 (fail-closed: ADMIN 폴백 금지) */
function resolveUserType(user: UserInfo): "ADMIN" | "STORE" | "SEKO" | "GENERAL" {
  const result = userTpSchema.safeParse(user.userType);
  if (result.success) return result.data;
  throw new Error(`알 수 없는 userType: ${user.userType}`);
}

const LOG_TAG_POST = "POST /api/admin/mass-mails";

// ─── POST 헬퍼: 요청 파싱/검증 ───

interface ParsedRequest {
  user: UserInfo;
  data: ReturnType<typeof massMailCreateSchema.parse>;
  sanitizedBody: string;
  userType: "ADMIN" | "STORE" | "SEKO" | "GENERAL";
  files: File[];
}

async function parseAndValidateRequest(request: NextRequest): Promise<ParsedRequest | NextResponse> {
  const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "create");
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  // Content-Length 사전 차단
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength === null) {
    console.warn("[POST /api/admin/mass-mails] Content-Length 누락 — chunked encoding 거부");
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
    console.warn("[POST /api/admin/mass-mails] Content-Length 초과:", contentLength);
    return NextResponse.json(
      { error: "リクエストサイズが大きすぎます" },
      { status: 413 },
    );
  }

  // FormData 파싱
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error: unknown) {
    console.warn("[POST /api/admin/mass-mails] FormData 파싱 실패:", error);
    return NextResponse.json(
      { error: "リクエスト形式が正しくありません" },
      { status: 400 },
    );
  }

  // 텍스트 필드 검증
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

  // 시공점(SEKO) 발송 미지원 — AS-IS API 미확보
  if (data.targetRoleCodes.includes("SEKO")) {
    return NextResponse.json(
      { error: "施工店(SEKO)向け一括送信は現在対応していません" },
      { status: 400 },
    );
  }

  // 첨부파일 검증
  const rawFiles = formData.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length > 0) {
    // 메일 정책 — 콘텐츠보다 좁은 화이트리스트 (수신자 보호: 동영상/압축/한글 등 제외).
    const validation = validateFiles(files, "mail");
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 합계 용량 검증 — 신규 업로드 합계 ≤ MAX_FILE_SIZE (콘텐츠 첨부와 동일 정책).
    const incomingBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (incomingBytes > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `添付ファイルの合計容量が${MAX_FILE_SIZE_MB}MBを超えています` },
        { status: 400 },
      );
    }
  }

  // HTML body sanitization (stored XSS 방어)
  // RichEditor 출력(color/font-size span, mark/highlight, table 등)을 보존하기 위해
  // FE 의 표준 sanitizer 사용. 메일 본문도 contents 와 동일한 화이트리스트를 통과.
  const sanitizedBody = sanitizeContentHtml(data.body);

  if (!sanitizedBody.trim()) {
    return NextResponse.json(
      { error: "本文の内容が無効です" },
      { status: 400 },
    );
  }

  // userType 매핑
  let userType: "ADMIN" | "STORE" | "SEKO" | "GENERAL";
  try {
    userType = resolveUserType(user);
  } catch (error: unknown) {
    console.error("[POST /api/admin/mass-mails] userType 매핑 실패:", user.userType, error);
    return NextResponse.json(
      { error: "ユーザー種別が不正です" },
      { status: 400 },
    );
  }

  return { user, data, sanitizedBody, userType, files };
}

// ─── POST 헬퍼: 첨부파일 디스크 기록 ───

interface PersistResult {
  writtenFiles: PersistedAttachment[];
  uploadDir: string | undefined;
}

async function persistAttachments(files: File[]): Promise<PersistResult | NextResponse> {
  if (files.length === 0) {
    return { writtenFiles: [], uploadDir: undefined };
  }

  const tempId = randomUUID();
  const uploadDir = join(UPLOAD_DIR, "mass-mails", tempId);
  await mkdir(uploadDir, { recursive: true });
  const uploadDirAbsolute = resolve(uploadDir);

  try {
    const writePromises = files.map(async (file) => {
      const sanitizedName = basename(file.name);
      const lastDot = sanitizedName.lastIndexOf(".");
      const ext = lastDot > 0
        ? sanitizedName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
        : "";
      const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
      const filePath = `mass-mails/${tempId}/${safeFileName}`;
      const absolutePath = resolve(uploadDir, safeFileName);

      if (!isInsideDir(absolutePath, uploadDirAbsolute)) {
        console.error("[POST /api/admin/mass-mails] PATH TRAVERSAL 감지:", {
          fileName: file.name,
          resolvedPath: absolutePath,
          uploadDir: uploadDirAbsolute,
        });
        return { error: true as const };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      // Legacy Office (OLE2) 감지 — 매크로 유무는 stream 분석 필요. 감사 로깅만 수행 (차단 X).
      // contents 라우트와 동일 정책 (PR #222 HIGH) — xls/ppt 허용 시 추적 가능성 확보.
      const head = new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(8, buffer.byteLength));
      if (isLegacyOfficeOLE2(head)) {
        console.warn("[POST /api/admin/mass-mails] Legacy Office OLE2 감지 — 매크로 가능성 추적:", {
          fileName: file.name,
          size: file.size,
        });
      }
      await writeFile(absolutePath, buffer);
      return { error: false as const, absolutePath, file, filePath };
    });

    const results = await Promise.all(writePromises);

    const successes = results.filter((r): r is PersistedAttachment & { error: false } => !r.error);
    const hasTraversalError = results.some((r) => r.error);

    if (hasTraversalError) {
      await cleanupAttachments(successes, LOG_TAG_POST, uploadDir);
      return NextResponse.json({ error: "ファイル名が正しくありません" }, { status: 400 });
    }

    return { writtenFiles: successes, uploadDir };
  } catch (error: unknown) {
    await rm(uploadDir, { recursive: true, force: true }).catch((e: unknown) => {
      console.error("[POST /api/admin/mass-mails] 부분 실패 디렉토리 정리 실패:", uploadDir, e);
    });
    throw error;
  }
}

// ─── POST 헬퍼: DB 레코드 생성 ───

interface CreateRecordParams {
  user: UserInfo;
  data: ReturnType<typeof massMailCreateSchema.parse>;
  sanitizedBody: string;
  userType: "ADMIN" | "STORE" | "SEKO" | "GENERAL";
  writtenFiles: PersistedAttachment[];
}

async function createMassMailRecord(params: CreateRecordParams): Promise<number> {
  const { user, data, sanitizedBody, userType, writtenFiles } = params;

  const txResult = await prisma.$transaction(async (tx) => {
    const massMail = await tx.massMail.create({
      data: {
        userType,
        userId: user.userId,
        senderName: data.senderName,
        optOut: data.optOut,
        subject: data.subject,
        body: sanitizedBody,
        status: data.status,
        createdBy: user.userId,
        createdByName: user.name ?? null,
        updatedBy: user.userId,
        targets: {
          create: data.targetRoleCodes.map((code) => ({ roleCode: code })),
        },
      },
    });

    if (writtenFiles.length > 0) {
      await tx.massMailAttachment.createMany({
        data: writtenFiles.map((w) => ({
          massMailId: massMail.id,
          fileName: basename(w.file.name),
          filePath: w.filePath,
          fileSize: BigInt(w.file.size),
          createdBy: user.userId,
          updatedBy: user.userId,
        })),
      });
    }

    return massMail;
  });

  return txResult.id;
}

// GET /api/admin/mass-mails — 대량메일 목록
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "read");
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = request.nextUrl;
    const queryResult = massMailListQuerySchema.safeParse({
      keyword: searchParams.get("keyword") ?? undefined,
      roleCode: searchParams.get("roleCode") ?? undefined,
      draftOnly: searchParams.get("draftOnly") ?? undefined,
      authorSearchType: searchParams.get("authorSearchType") ?? undefined,
      authorQuery: searchParams.get("authorQuery") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: "パラメータが正しくありません", details: queryResult.error.issues },
        { status: 400 },
      );
    }

    const { keyword, roleCode: roleCodeParam, draftOnly, authorSearchType, authorQuery, startDate, endDate, page, pageSize } = queryResult.data;

    // roleCode 멀티 선택 (comma-separated)
    const targetRoleCodes: string[] = [];
    if (roleCodeParam) {
      const codes = roleCodeParam.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      const seen = new Set<string>();
      for (const code of codes) {
        if (!ROLE_CODE_FORMAT.test(code) || code.length > 50) {
          return NextResponse.json(
            { error: "送信先フィルタの値が正しくありません" },
            { status: 400 },
          );
        }
        if (seen.has(code)) continue;
        seen.add(code);
        targetRoleCodes.push(code);
      }
    }

    const where: Prisma.MassMailWhereInput = {};

    if (keyword) {
      where.subject = { startsWith: keyword };
    }

    if (draftOnly) {
      where.status = "draft";
    }

    if (targetRoleCodes.length > 0) {
      where.targets = { some: { roleCode: { in: targetRoleCodes } } };
    }

    if (authorQuery && authorSearchType) {
      if (authorSearchType === "name") {
        where.OR = [
          { createdByName: { contains: authorQuery } },
          { createdByName: null, senderName: { contains: authorQuery } },
        ];
      } else {
        where.userId = { contains: authorQuery };
      }
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00+09:00`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999+09:00`);
      }
    }

    const [totalCount, list] = await Promise.all([
      prisma.massMail.count({ where }),
      prisma.massMail.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          attachments: { select: { id: true } },
          targets: { select: { roleCode: true } },
        },
      }),
    ]);

    const mappedList = list.map((mail) => ({
      id: mail.id,
      status: mail.status,
      /** 게시대상 권한코드 배열 — FE 가 useTargetLabels 로 라벨링 */
      targetRoleCodes: mail.targets.map((t) => t.roleCode),
      subject: mail.subject,
      hasAttachment: mail.attachments.length > 0,
      senderName: mail.senderName,
      senderId: mail.userId,
      createdByName: mail.createdByName ?? null,
      sentAt: mail.sentAt?.toISOString() ?? null,
      createdAt: mail.createdAt.toISOString(),
    }));

    console.log(`[GET /api/admin/mass-mails] 대량메일 목록 조회 — ${totalCount}건 중 ${mappedList.length}건 반환`);

    return NextResponse.json({
      data: {
        totalCount,
        page,
        pageSize,
        list: mappedList,
      },
    });
  } catch (error: unknown) {
    logError("GET /api/admin/mass-mails", error);
    return NextResponse.json(
      { error: "メール一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/admin/mass-mails — 대량메일 등록 (multipart/form-data)
export async function POST(request: NextRequest) {
  let writtenFiles: PersistedAttachment[] = [];
  let uploadDir: string | undefined;

  try {
    const parsed = await parseAndValidateRequest(request);
    if (parsed instanceof NextResponse) return parsed;
    const { user, data, sanitizedBody, userType, files } = parsed;

    const persistResult = await persistAttachments(files);
    if (persistResult instanceof NextResponse) return persistResult;
    writtenFiles = persistResult.writtenFiles;
    uploadDir = persistResult.uploadDir;

    let massMailId: number;
    try {
      massMailId = await createMassMailRecord({
        user, data, sanitizedBody, userType, writtenFiles,
      });
    } catch (dbError: unknown) {
      await cleanupAttachments(writtenFiles, LOG_TAG_POST, uploadDir);
      writtenFiles = [];
      uploadDir = undefined;
      throw dbError;
    }

    const statusMsg = data.status === "pending"
      ? "メール送信を受け付けました。"
      : "下書きとして保存しました。";

    console.log(`[POST /api/admin/mass-mails] 대량메일 등록 완료 — id: ${massMailId}, status: ${data.status}`);

    if (data.status === "pending") {
      processMassMailSend({ massMailId }).catch((err: unknown) => {
        console.error(
          `[POST /api/admin/mass-mails] CRITICAL — 비동기 발송 fire-and-forget 새어남. 좀비 감지 의존. massMailId: ${massMailId}`,
          err,
        );
      });
    }

    return NextResponse.json(
      { data: { id: massMailId, status: data.status, message: statusMsg } },
      { status: 201 },
    );
  } catch (error: unknown) {
    await cleanupAttachments(writtenFiles, LOG_TAG_POST, uploadDir);
    logError("POST /api/admin/mass-mails", error);
    return NextResponse.json(
      { error: "メールの登録に失敗しました" },
      { status: 500 },
    );
  }
}
