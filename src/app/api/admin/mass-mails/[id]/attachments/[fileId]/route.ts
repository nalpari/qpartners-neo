import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { resolve } from "path";

import { Prisma } from "@/generated/prisma/client";

import { canModifyResource, requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { logError } from "@/lib/log-error";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { massMailIdParamSchema } from "@/lib/schemas/mass-mail";

type Params = { params: Promise<{ id: string; fileId: string }> };

const LOG_TAG = "DELETE /api/admin/mass-mails/:id/attachments/:fileId";

// DELETE /api/admin/mass-mails/:id/attachments/:fileId — 대량메일 개별 첨부파일 즉시 삭제
//
// 편집(下書き) 화면에서 첨부 X 버튼 클릭 시 저장(PUT) 없이 즉시 서버에서 제거하기 위한 엔드포인트.
// 콘텐츠(DELETE /api/contents/:id/files/:fileId)와 동일한 즉시 삭제 UX 를 대량메일에 제공한다.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // 1. 권한 확인 — 편집(下書き) 컨텍스트의 첨부 삭제이므로 update 매트릭스 기반.
    //    FE 가 edit 모드(canUpdate)에서만 X 버튼을 노출하는 가드와 일치시켜, 편집 가능한
    //    사용자가 첨부 삭제만 막히는 권한 불일치를 방지한다.
    const authResult = await requireMenuPermission(request.headers, "ADM_BULK_MAIL", "update");
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. ID 파라미터 검증 (메일 ID + 첨부 ID 모두 양의 정수)
    const { id: rawId, fileId: rawFileId } = await params;
    const idResult = massMailIdParamSchema.safeParse(rawId);
    const fileIdResult = massMailIdParamSchema.safeParse(rawFileId);
    if (!idResult.success || !fileIdResult.success) {
      return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });
    }

    // 3. 메일 존재 + 소유권 + 상태 확인
    const mail = await prisma.massMail.findUnique({
      where: { id: idResult.data },
      select: { id: true, userType: true, userId: true, status: true },
    });

    if (!mail) {
      return NextResponse.json({ error: "メールが見つかりません" }, { status: 404 });
    }

    // 소유권 검증: SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인.
    // ownership → status 순서 — 타인 소유 메일의 상태 enumeration 차단 (메일 단건 DELETE 핸들러와 동일.
    // PUT 핸들러는 status 우선이라 순서가 다름 — 본 핸들러는 enumeration 방어를 위해 ownership 우선 채택).
    if (!(await canModifyResource(user, mail))) {
      return NextResponse.json(
        { error: "このメールを編集する権限がありません" },
        { status: 403 },
      );
    }

    // 발송된 메일의 첨부는 삭제 불가 — 下書き(draft)만 허용 (PUT/DELETE 핸들러와 동일 정책).
    if (mail.status !== "draft") {
      return NextResponse.json(
        { error: "下書き以外のメールは編集できません" },
        { status: 400 },
      );
    }

    // 4. 첨부파일 조회 — massMailId 복합 조건으로 타 메일 첨부 ID 오삭제(IDOR) 차단.
    const attachment = await prisma.massMailAttachment.findFirst({
      where: { id: fileIdResult.data, massMailId: idResult.data },
      select: { id: true, filePath: true },
    });

    if (!attachment) {
      return NextResponse.json({ error: "添付ファイルが見つかりません" }, { status: 404 });
    }

    // 5. DB 삭제 — 동시 DELETE race 는 P2025 → 404 로 수렴 (500 아님).
    try {
      await prisma.massMailAttachment.delete({ where: { id: fileIdResult.data } });
    } catch (dbError: unknown) {
      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2025"
      ) {
        console.warn(`[${LOG_TAG}] 동시 DELETE 감지(P2025):`, fileIdResult.data);
        return NextResponse.json({ error: "添付ファイルが見つかりません" }, { status: 404 });
      }
      throw dbError;
    }

    // 6. 디스크 파일 정리 (best-effort — 실패해도 DB 삭제는 유지, 경고 로그만).
    const absolutePath = resolve(UPLOAD_DIR, attachment.filePath);
    const storageRoot = resolve(UPLOAD_DIR);
    if (isInsideDir(absolutePath, storageRoot)) {
      // 심볼릭 링크 방어 — symlink/비정규 파일이면 unlink 생략 (lexical 검증만으로는 불충분).
      const regular = await isRegularFile(absolutePath);
      if (!regular) {
        console.warn(`[${LOG_TAG}] 정규 파일 아님/부재 — unlink 생략:`, attachment.filePath);
      } else {
        await unlink(absolutePath).catch((err: unknown) => {
          console.error(`[${LOG_TAG}] 디스크 파일 삭제 실패:`, {
            attachmentId: fileIdResult.data,
            path: attachment.filePath,
            error: err,
          });
        });
      }
    } else {
      // 보안 이벤트 — 포렌식 목적으로 절대경로 유지
      console.error(`[${LOG_TAG}] 이상 경로 감지:`, absolutePath);
    }

    console.log(`[${LOG_TAG}] 첨부파일 삭제 완료 — attachmentId: ${fileIdResult.data}, userId: ${user.userId}`);

    return NextResponse.json({ data: { message: "添付ファイルを削除しました" } });
  } catch (error: unknown) {
    const prismaErrorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    logError(LOG_TAG, error, { prismaErrorCode });
    return NextResponse.json(
      { error: "添付ファイルの削除に失敗しました" },
      { status: 500 },
    );
  }
}
