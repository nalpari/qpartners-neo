import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { processMassMailRetry } from "@/lib/mass-mail/send-processor";
import { prisma } from "@/lib/prisma";
import { massMailIdParamSchema } from "@/lib/schemas/mass-mail";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/mass-mails/:id/retry — send_failed 대량메일 재발송
export async function POST(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
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

    // 3. 레코드 조회 — 소유권 + 상태 체크
    const mail = await prisma.massMail.findUnique({
      where: { id: idResult.data },
      select: { userId: true, status: true },
    });
    if (!mail) {
      return NextResponse.json(
        { error: "メールが見つかりません" },
        { status: 404 },
      );
    }
    if (mail.userId !== user.userId) {
      return NextResponse.json(
        { error: "他のユーザーが作成したメールは再送信できません" },
        { status: 403 },
      );
    }
    if (mail.status !== "send_failed") {
      return NextResponse.json(
        { error: "送信失敗状態のメールのみ再送信できます" },
        { status: 400 },
      );
    }

    // 4. 낙관적 락 — send_failed → sending 전이 (동시 재발송 방지)
    const updated = await prisma.massMail.updateMany({
      where: { id: idResult.data, status: "send_failed" },
      data: { status: "sending" },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "現在の状態では再送信できません" },
        { status: 409 },
      );
    }

    console.log(`[POST /api/admin/mass-mails/:id/retry] 재발송 수락 — id: ${idResult.data}, userId: ${user.userId}`);

    // 5. Fire-and-Forget
    processMassMailRetry(idResult.data).catch((err: unknown) => {
      console.error("[POST /api/admin/mass-mails/:id/retry] 비동기 재발송 실패:", err);
    });

    return NextResponse.json({
      data: {
        id: idResult.data,
        message: "メール再送信を受け付けました。",
      },
    });
  } catch (error: unknown) {
    console.error("[POST /api/admin/mass-mails/:id/retry] 재발송 실패:", error);
    return NextResponse.json(
      { error: "メールの再送信に失敗しました" },
      { status: 500 },
    );
  }
}
