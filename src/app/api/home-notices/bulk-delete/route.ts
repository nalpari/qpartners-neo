import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { z } from "zod";

import { canModifyResource, requireMenuPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 한 번에 일괄 삭제할 수 있는 최대 건수 — UI 페이지 사이즈(20) 의 5배 정도로 보수적 상한.
// DB 쪽 in 절 길이/트랜잭션 시간 제한에 영향받지 않는 안전 범위.
const MAX_BULK_DELETE = 100;

const bulkDeleteSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "削除対象を1件以上選択してください")
    .max(MAX_BULK_DELETE, `一度に削除できるのは${MAX_BULK_DELETE}件までです`)
    // 동일 ID 중복 제거 — 클라이언트가 같은 ID 를 두 번 보내도 안전.
    .transform((arr) => Array.from(new Set(arr))),
});

class BulkDeleteError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN",
    public readonly detail: { missingIds?: number[]; deniedIds?: number[] },
  ) {
    super(code);
    this.name = "BulkDeleteError";
  }
}

// POST /api/home-notices/bulk-delete — 홈 공지 일괄 삭제 (ADM_NOTICE.delete 매트릭스 기반)
//
// 정책 (all-or-nothing):
//   - 요청한 ID 중 하나라도 미존재 → 404 + missingIds, 어느 것도 삭제하지 않음
//   - 요청한 ID 중 하나라도 권한 없음 → 403 + deniedIds, 어느 것도 삭제하지 않음
//   - 모두 통과 시에만 일괄 삭제 (하나의 트랜잭션, deleteMany)
//
// 단건 DELETE 와 권한 모델은 동일 — SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인 작성글.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMenuPermission(request.headers, "ADM_NOTICE", "delete");
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn("[POST /api/home-notices/bulk-delete] Request body 파싱 실패:", parseError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const parsed = bulkDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const ids = parsed.data.ids;

    // Serializable — 권한 검증과 deleteMany 사이에 다른 세션이 작성자/소유자를 수정하는
    // race 차단. 단건 DELETE/PUT 핸들러와 동일 isolation level.
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. 대상 전체 조회 (존재 확인 + 권한 판정용 메타).
        const notices = await tx.homeNotice.findMany({
          where: { id: { in: ids } },
          select: { id: true, userType: true, userId: true },
        });

        // 2. 존재 여부 검증 — 일부라도 없으면 전체 거부.
        if (notices.length !== ids.length) {
          const foundIds = new Set(notices.map((n) => n.id));
          const missingIds = ids.filter((id) => !foundIds.has(id));
          throw new BulkDeleteError("NOT_FOUND", { missingIds });
        }

        // 3. 권한 검증 — 한 건이라도 권한 없으면 전체 거부 (fail-closed).
        //    canModifyResource 는 SUPER_ADMIN 작성글 식별 위해 비동기 (DB 조회 가능).
        //    Serializable 트랜잭션 안에서 Promise.all 병렬 실행은 일부 드라이버/풀에서
        //    동일 트랜잭션 커넥션의 동시 사용을 막기 때문에 dead-lock 위험이 있어
        //    안정성을 위해 순차 처리. (canModifyResource 자체는 prisma 글로벌 인스턴스를
        //    사용하므로 트랜잭션과 직접 경쟁하지는 않지만, 향후 tx 사용으로 옮기더라도
        //    안전하도록 sequential 패턴을 채택.)
        const deniedIds: number[] = [];
        for (const notice of notices) {
          const allowed = await canModifyResource(auth.user, notice);
          if (!allowed) deniedIds.push(notice.id);
        }
        if (deniedIds.length > 0) {
          throw new BulkDeleteError("FORBIDDEN", { deniedIds });
        }

        // 4. 일괄 삭제 — 단일 SQL.
        const deleted = await tx.homeNotice.deleteMany({
          where: { id: { in: ids } },
        });

        return { deletedCount: deleted.count, ids };
      },
      { isolationLevel: "Serializable" },
    );

    // 감사 로그 — PII 없음. 운영 추적용 (요청자 userId/role + ID 목록).
    console.info("[POST /api/home-notices/bulk-delete] bulk deleted", {
      requestedCount: ids.length,
      deletedCount: result.deletedCount,
      ids: result.ids,
      by: auth.user.userId,
      role: auth.user.role,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof BulkDeleteError) {
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          {
            error: "一部のお知らせが見つかりません",
            missingIds: error.detail.missingIds,
          },
          { status: 404 },
        );
      }
      if (error.code === "FORBIDDEN") {
        return NextResponse.json(
          {
            error: "一部のお知らせを削除する権限がありません",
            deniedIds: error.detail.deniedIds,
          },
          { status: 403 },
        );
      }
    }
    console.error("[POST /api/home-notices/bulk-delete]", error);
    return NextResponse.json(
      { error: "一括削除に失敗しました" },
      { status: 500 },
    );
  }
}
