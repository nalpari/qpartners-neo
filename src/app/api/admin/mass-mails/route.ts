import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, basename, resolve } from "path";
import { randomUUID } from "crypto";
import DOMPurify from "isomorphic-dompurify";

import { requireAdmin } from "@/lib/auth";
import type { UserInfo } from "@/lib/auth";
import { MAX_FILE_SIZE, validateFiles } from "@/lib/file-validation";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { userTpSchema } from "@/lib/schemas/common";
import {
  massMailListQuerySchema,
  massMailCreateSchema,
  TARGET_LABELS,
  TARGET_FILTER_MAP,
} from "@/lib/schemas/mass-mail";
import type { TargetKey } from "@/lib/schemas/mass-mail";
import type { Prisma } from "@/generated/prisma/client";

/** 발송대상 boolean → 콤마 구분 라벨 문자열 */
function buildTargetLabel(mail: Record<TargetKey, boolean>): string {
  return TARGET_LABELS
    .filter((t) => mail[t.key] === true)
    .map((t) => t.label)
    .join(", ") || "—";
}

/** 첨부파일 최대 개수 */
const MAX_FILES = 10;

// GET /api/admin/mass-mails — 대량메일 목록
export async function GET(request: NextRequest) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = request.nextUrl;
    const queryResult = massMailListQuerySchema.safeParse({
      keyword: searchParams.get("keyword") ?? undefined,
      target: searchParams.get("target") ?? undefined,
      draftOnly: searchParams.get("draftOnly") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: "パラメータが正しくありません", details: queryResult.error.issues },
        { status: 400 },
      );
    }

    const { keyword, target, draftOnly, page, pageSize } = queryResult.data;

    // 3. 검색 조건 구성
    const where: Prisma.MassMailWhereInput = {};

    if (keyword) {
      where.subject = { contains: keyword };
    }

    if (draftOnly) {
      where.status = "draft";
    }

    // 발송대상 필터: responseKey 기반 ASCII 키 ("super_admin", "admin" 등)
    if (target) {
      const targetField = TARGET_FILTER_MAP[target];
      if (targetField) {
        where[targetField] = true;
      }
    }

    // 4. 조회 (최근 발송순 정렬)
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

    // 5. 응답 매핑
    const mappedList = list.map((mail) => ({
      id: mail.id,
      status: mail.status,
      targets: buildTargetLabel(mail),
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
    console.error("[GET /api/admin/mass-mails] 목록 조회 실패:", error);
    return NextResponse.json(
      { error: "メール一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST /api/admin/mass-mails — 대량메일 등록 (multipart/form-data)
export async function POST(request: NextRequest) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. Body size 사전 차단 — formData() 호출 전 Content-Length 확인 (DoS 방어)
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const MAX_BATCH_SIZE = MAX_FILE_SIZE * MAX_FILES + 1024 * 1024; // ~501MB + 1MB 헤더 여유
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

    // 발송대상 최소 1개 선택 확인
    const data = result.data;
    const hasTarget = data.targetSuperAdmin || data.targetAdmin ||
      data.targetFirstDealer || data.targetSecondDealer ||
      data.targetConstructor || data.targetGeneral;
    if (!hasTarget) {
      return NextResponse.json(
        { error: "送信先を1つ以上選択してください" },
        { status: 400 },
      );
    }

    // 5. 첨부파일 검증 — 공통 유틸 사용 (size, 확장자, MIME 검증 일원화)
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

    // 6. HTML body sanitization (stored XSS 방어 — script, event handlers, javascript: URL 제거)
    const sanitizedBody = DOMPurify.sanitize(data.body, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
        "table", "thead", "tbody", "tr", "th", "td",
        "img", "span", "div", "hr",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "style", "class", "target", "rel"],
      ALLOW_DATA_ATTR: false,
    });

    // 7. userType 매핑
    const userType = resolveUserType(user);

    // 8. 첨부파일 디스크 기록 (트랜잭션 전에 준비)
    const writtenFiles: { absolutePath: string; file: File; filePath: string }[] = [];
    const tempId = randomUUID();
    if (files.length > 0) {
      const uploadDir = join(process.cwd(), "storage", "uploads", "mass-mails", tempId);
      await mkdir(uploadDir, { recursive: true });
      const uploadDirAbsolute = resolve(uploadDir);

      for (const file of files) {
        const sanitizedName = basename(file.name);
        const ext = sanitizedName.split(".").pop() ?? "";
        const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
        const filePath = `storage/uploads/mass-mails/${tempId}/${safeFileName}`;
        const absolutePath = resolve(uploadDir, safeFileName);

        // path traversal 방어 — isInsideDir (startsWith prefix bug 회피)
        if (!isInsideDir(absolutePath, uploadDirAbsolute)) {
          return NextResponse.json({ error: "ファイル名が正しくありません" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(absolutePath, buffer);
        writtenFiles.push({ absolutePath, file, filePath });
      }
    }

    // 9. interactive 트랜잭션: massMail + attachment 일괄 생성 (고아 레코드 방지)
    let massMailId: number;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const massMail = await tx.massMail.create({
          data: {
            userType,
            userId: user.userId,
            senderName: data.senderName,
            targetSuperAdmin: data.targetSuperAdmin,
            targetAdmin: data.targetAdmin,
            targetFirstDealer: data.targetFirstDealer,
            targetSecondDealer: data.targetSecondDealer,
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

        for (const w of writtenFiles) {
          await tx.massMailAttachment.create({
            data: {
              massMailId: massMail.id,
              // basename 적용된 이름만 저장 (Zip Slip / XSS 방어)
              fileName: basename(w.file.name),
              filePath: w.filePath,
              fileSize: BigInt(w.file.size),
              createdBy: user.userId,
              updatedBy: user.userId,
            },
          });
        }

        return massMail;
      });
      massMailId = txResult.id;
    } catch (dbError: unknown) {
      // DB 트랜잭션 실패 시 디스크 파일 정리
      for (const w of writtenFiles) {
        await unlink(w.absolutePath).catch((unlinkErr: unknown) => {
          console.error("[POST /api/admin/mass-mails] 첨부파일 정리 실패:", unlinkErr);
        });
      }
      throw dbError;
    }

    const statusMsg = data.status === "pending"
      ? "メールが送信予約されました。"
      : "下書きとして保存しました。";

    console.log(`[POST /api/admin/mass-mails] 대량메일 등록 완료 — id: ${massMailId}, status: ${data.status}`);

    return NextResponse.json(
      { data: { id: massMailId, message: statusMsg } },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[POST /api/admin/mass-mails] 등록 실패:", error);
    return NextResponse.json(
      { error: "メールの登録に失敗しました" },
      { status: 500 },
    );
  }
}

/** UserInfo → DB enum 매핑 — 미지의 userType은 에러 (최소 권한 원칙, ADMIN 폴백 금지) */
function resolveUserType(user: UserInfo): "ADMIN" | "STORE" | "SEKO" | "GENERAL" {
  const result = userTpSchema.safeParse(user.userType);
  if (result.success) return result.data;
  throw new Error(`알 수 없는 userType: ${user.userType}`);
}
