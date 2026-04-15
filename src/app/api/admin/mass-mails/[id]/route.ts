import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { join, resolve } from "path";

import { requireAdmin } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import {
  massMailIdParamSchema,
  buildTargetsObject,
  buildTargetLabel,
} from "@/lib/schemas/mass-mail";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/mass-mails/:id — 상세 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
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

    // 3. 조회 (첨부파일 포함)
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
      },
    });

    if (!mail) {
      return NextResponse.json(
        { error: "メールが見つかりません" },
        { status: 404 },
      );
    }

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
      attachments: mail.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize !== null ? Number(a.fileSize) : null,
      })),
      createdBy: mail.createdBy ?? "",
      createdAt: mail.createdAt.toISOString(),
    };

    console.log(`[GET /api/admin/mass-mails/:id] 대량메일 상세 조회 — id: ${mail.id}, userId: ${authResult.user.userId}`);

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    console.error("[GET /api/admin/mass-mails/:id] 상세 조회 실패:", error);
    return NextResponse.json(
      { error: "メール詳細の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/mass-mails/:id — 대량메일 단건 삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
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

    // 3. 첨부파일 경로 조회 (디스크 정리용)
    const mail = await prisma.massMail.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
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
    console.error("[DELETE /api/admin/mass-mails/:id] 삭제 실패:", error);
    return NextResponse.json(
      { error: "メールの削除に失敗しました" },
      { status: 500 },
    );
  }
}
