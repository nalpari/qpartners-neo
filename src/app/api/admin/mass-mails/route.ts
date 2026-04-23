import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, rm } from "fs/promises";
import { join, basename, resolve } from "path";
import { randomUUID } from "crypto";
import DOMPurify from "isomorphic-dompurify";

import { requireMenuPermission } from "@/lib/auth";
import type { UserInfo } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { MAX_FILE_SIZE, validateFiles } from "@/lib/file-validation";
import { logError } from "@/lib/log-error";
import { cleanupAttachments, SANITIZE_CONFIG } from "@/lib/mass-mail-utils";
import type { PersistedAttachment } from "@/lib/mass-mail-utils";
import { processMassMailSend } from "@/lib/mass-mail/send-processor";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { userTpSchema } from "@/lib/schemas/common";
import {
  massMailListQuerySchema,
  massMailCreateSchema,
  TARGET_KEYS,
  TARGET_FILTER_MAP,
  buildTargetsObject,
  buildTargetLabel,
} from "@/lib/schemas/mass-mail";
import type { Prisma } from "@/generated/prisma/client";

/** 첨부파일 최대 개수 */
const MAX_FILES = 10;

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
  // 1. 관리자 권한 확인 — BULK_MAIL.create 매트릭스 기반 (POST 전용 헬퍼)
  const authResult = await requireMenuPermission(request.headers, "BULK_MAIL", "create");
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  // 2. Body size 사전 차단 — formData() 호출 전 Content-Length 확인
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
  const MAX_BATCH_SIZE = MAX_FILE_SIZE * MAX_FILES + 1024 * 1024;
  if (contentLength > MAX_BATCH_SIZE) {
    console.warn("[POST /api/admin/mass-mails] Content-Length 초과:", contentLength);
    return NextResponse.json(
      { error: "リクエストサイズが大きすぎます" },
      { status: 413 },
    );
  }

  // 3. FormData 파싱
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

  // 4. 텍스트 필드 검증
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

  // 발송대상 최소 1개 선택 확인 — TARGET_KEYS 기반 (OCP)
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
  const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `添付ファイルは${MAX_FILES}件以内にしてください` },
      { status: 400 },
    );
  }

  if (files.length > 0) {
    const validation = validateFiles(files);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }

  // 6. HTML body sanitization (stored XSS 방어 — 공통 화이트리스트 설정 사용)
  const sanitizedBody = DOMPurify.sanitize(data.body, SANITIZE_CONFIG);

  // sanitize 후 빈 body 검증
  if (!sanitizedBody.trim()) {
    return NextResponse.json(
      { error: "本文の内容が無効です" },
      { status: 400 },
    );
  }

  // 7. userType 매핑
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

      // path traversal 방어 — isInsideDir (startsWith prefix bug 회피)
      if (!isInsideDir(absolutePath, uploadDirAbsolute)) {
        // 보안 이벤트 — 포렌식 목적으로 절대경로 유지
        console.error("[POST /api/admin/mass-mails] PATH TRAVERSAL 감지:", {
          fileName: file.name,
          resolvedPath: absolutePath,
          uploadDir: uploadDirAbsolute,
        });
        return { error: true as const };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(absolutePath, buffer);
      return { error: false as const, absolutePath, file, filePath };
    });

    const results = await Promise.all(writePromises);

    // 성공 파일 전체 수집 후 에러 체크 (레이스 컨디션 방지)
    const successes = results.filter((r): r is PersistedAttachment & { error: false } => !r.error);
    const hasTraversalError = results.some((r) => r.error);

    if (hasTraversalError) {
      await cleanupAttachments(successes, LOG_TAG_POST, uploadDir);
      return NextResponse.json({ error: "ファイル名が正しくありません" }, { status: 400 });
    }

    return { writtenFiles: successes, uploadDir };
  } catch (error: unknown) {
    // writeFile 부분 실패 시 업로드 디렉토리 전체 정리 (파일 누수 방지)
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
        createdBy: user.userId,
        updatedBy: user.userId,
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
    // 1. 관리자 권한 확인 — BULK_MAIL.read 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "BULK_MAIL", "read");
    if (authResult instanceof NextResponse) return authResult;

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = request.nextUrl;
    const queryResult = massMailListQuerySchema.safeParse({
      keyword: searchParams.get("keyword") ?? undefined,
      target: searchParams.get("target") ?? undefined,
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

    const { keyword, target, draftOnly, authorSearchType, authorQuery, startDate, endDate, page, pageSize } = queryResult.data;

    // 3. 검색 조건 구성
    const where: Prisma.MassMailWhereInput = {};

    if (keyword) {
      where.subject = { startsWith: keyword };
    }

    if (draftOnly) {
      where.status = "draft";
    }

    // 발송대상 필터: responseKey 기반 ASCII 키 ("super_admin", "admin" 등)
    if (target) {
      const targetField = TARGET_FILTER_MAP[target];
      if (!targetField) {
        return NextResponse.json(
          { error: "送信先フィルタの値が正しくありません" },
          { status: 400 },
        );
      }
      where[targetField] = true;
    }

    // 登録者 검색 (name → senderName, id → userId)
    if (authorQuery && authorSearchType) {
      if (authorSearchType === "name") {
        where.senderName = { contains: authorQuery };
      } else {
        where.userId = { contains: authorQuery };
      }
    }

    // 登録日 범위 검색 (JST 타임존 명시)
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00+09:00`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999+09:00`);
      }
    }

    // 4. 조회 (최근 등록순 정렬)
    const [totalCount, list] = await Promise.all([
      prisma.massMail.count({ where }),
      prisma.massMail.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          attachments: { select: { id: true } },
        },
      }),
    ]);

    // 5. 응답 매핑 — 목록도 targets를 object로 반환 (상세와 타입 통일)
    const mappedList = list.map((mail) => ({
      id: mail.id,
      status: mail.status,
      targets: buildTargetsObject(mail),
      targetsLabel: buildTargetLabel(mail),
      subject: mail.subject,
      hasAttachment: mail.attachments.length > 0,
      senderName: mail.senderName,
      senderId: mail.userId,
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
    // 1. 요청 파싱/검증
    const parsed = await parseAndValidateRequest(request);
    if (parsed instanceof NextResponse) return parsed;
    const { user, data, sanitizedBody, userType, files } = parsed;

    // 2. 첨부파일 디스크 기록
    const persistResult = await persistAttachments(files);
    if (persistResult instanceof NextResponse) return persistResult;
    writtenFiles = persistResult.writtenFiles;
    uploadDir = persistResult.uploadDir;

    // 3. DB 레코드 생성
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

    // 비동기 발송 트리거 (Fire-and-Forget) — 발송 결과는 status/recipients 로 추적.
    // processMassMailSend 가 자체 외부 안전망을 가지므로 이 catch 는 catastrophic 케이스 전용.
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
