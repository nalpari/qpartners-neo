import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  massMailIdParamSchema,
  TARGET_LABELS,
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

    // 4. 발송대상 객체 구성 (responseKey 사용, as 캐스팅 금지)
    const targets: Record<string, boolean> = {};
    for (const t of TARGET_LABELS) {
      targets[t.responseKey] = mail[t.key] === true;
    }

    // 5. 응답 매핑
    const mapped = {
      id: mail.id,
      senderName: mail.senderName,
      targets,
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

    console.log(`[GET /api/admin/mass-mails/:id] 대량메일 상세 조회 — id: ${mail.id}`);

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    console.error("[GET /api/admin/mass-mails/:id] 상세 조회 실패:", error);
    return NextResponse.json(
      { error: "メール詳細の取得に失敗しました" },
      { status: 500 },
    );
  }
}
