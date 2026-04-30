/**
 * 본문 임베드 이미지 active cleanup.
 *
 * 폼 저장 (`POST /api/contents` / `PUT /api/contents/:id`) 시점에 본문 HTML이
 * 실제로 참조하는 inline-image ID 집합과 DB의 행을 정합화한다.
 *
 * 동작:
 *   1) 본문에서 사용된 ID에 대해 `contentId`를 stamp (현재 사용자가 업로드한 행 또는 본 콘텐츠에 매핑된 행에 한함)
 *   2) 사용되지 않은 행을 DB에서 삭제
 *   3) 디스크 unlink 대상 경로를 호출자에게 반환 — commit 후 별도로 unlink
 *
 * 트랜잭션 commit 후 unlink가 실패해도 DB 정합성은 유지되며, 누수된 디스크 파일은
 * 후속 cron sweep으로 회수한다 (이번 PR scope 외).
 */

import { unlink } from "fs/promises";
import { relative, resolve } from "path";

import type { Prisma } from "@/generated/prisma/client";
import { UPLOAD_DIR } from "@/lib/config";
import { extractInlineImageIds } from "@/lib/block-editor/extract-inline-image-ids";
import { logError } from "@/lib/log-error";
import { isInsideDir } from "@/lib/path-safety";
import type { UserInfo } from "@/lib/auth";

type InlineImageOwnerType = UserInfo["userType"];

interface ReconcileBase {
  tx: Prisma.TransactionClient;
  /** 본문 HTML — `null` 은 "본문 비움". `undefined` 는 호출 전에 정규화(`body ?? null`)해야 함. */
  body: string | null;
  user: { userType: InlineImageOwnerType; userId: string };
}

/**
 * `kind` 로 호출 의도를 명시한다 — 두 분기에서 contentId 의 의미가 다르고
 * 정리 범위(create: contentId=null만 / update: 본 콘텐츠 매핑 포함)가 다르다.
 */
type ReconcileArgs =
  | ({ kind: "create"; contentId: number } & ReconcileBase)
  | ({ kind: "update"; contentId: number } & ReconcileBase);

interface ReconcileResult {
  /** 트랜잭션 commit 이후 unlink 해야 할 상대 경로(UPLOAD_DIR 기준) 목록 */
  unlinkPaths: string[];
}

export async function reconcileInlineImages(
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  const { tx, kind, contentId, body, user } = args;
  const usedIds = [...extractInlineImageIds(body)];

  // 1) 본문에 등장한 이미지에 contentId stamp.
  //    범위 제한:
  //      · `contentId=null` 이면서 본 사용자가 업로드한 행 — 신규 업로드분
  //      · 이미 본 콘텐츠에 매핑된 행 — 멱등 갱신 (수정 시 본문 그대로 둔 경우 영향 없음)
  //    → 다른 사용자의 임시 이미지가 본문에 끼어들었더라도 stamp 되지 않음 (URL 추측 방어)
  if (usedIds.length > 0) {
    const stamped = await tx.contentInlineImage.updateMany({
      where: {
        id: { in: usedIds },
        OR: [
          { contentId: null, ownerType: user.userType, ownerUserId: user.userId },
          { contentId },
        ],
      },
      data: { contentId },
    });
    // 본문이 참조한 ID 가 stamp 대상이 아닐 때 (다른 사용자 임시 이미지 / 추측 ID / 이미 다른 콘텐츠 매핑)
    // → 본문 src 는 살아 있으나 DB 소유는 변경되지 않음. 본문 깨짐 직전 상태 → 운영 추적용 warn.
    if (stamped.count < usedIds.length) {
      console.warn(
        "[reconcileInlineImages] 본문 참조 ID 중 stamp 불가 행 존재",
        {
          contentId,
          kind,
          requested: usedIds.length,
          stamped: stamped.count,
        },
      );
    }
  }

  // 2) 삭제 대상 식별.
  //    create: 본 사용자의 임시 행(contentId=null) 중 본문에 없는 것만 삭제
  //    update: 본 콘텐츠에 매핑된 기존 행도 삭제 대상에 포함
  const orConditions: Prisma.ContentInlineImageWhereInput[] = [
    { contentId: null, ownerType: user.userType, ownerUserId: user.userId },
  ];
  if (kind === "update") {
    orConditions.push({ contentId });
  }

  // Prisma `notIn: []` 는 모든 행을 매칭시키므로 빈 배열 가드 — id=0 은 양수 PK 정책상 절대 매칭되지 않음.
  const idsToExclude = usedIds.length > 0 ? usedIds : [0];

  const toDelete = await tx.contentInlineImage.findMany({
    where: {
      AND: [
        { id: { notIn: idsToExclude } },
        { OR: orConditions },
      ],
    },
    select: { id: true, filePath: true },
  });

  if (toDelete.length === 0) return { unlinkPaths: [] };

  await tx.contentInlineImage.deleteMany({
    where: { id: { in: toDelete.map((r) => r.id) } },
  });

  return { unlinkPaths: toDelete.map((r) => r.filePath) };
}

/**
 * 트랜잭션 commit 이후 디스크 파일 정리.
 * 실패해도 throw 하지 않음 — 누수된 파일은 후속 cron sweep이 회수.
 *
 * 부분 실패는 행별 console.error + 끝에서 합산 logError 로 1회 알림 — 다수 실패 시
 * 운영자가 batch 단위 시그널을 받을 수 있게 하면서 상세는 로그에 남긴다.
 */
export async function unlinkInlineImages(
  paths: string[],
  logTag = "[inline-image-cleanup]",
): Promise<void> {
  if (paths.length === 0) return;
  const storageRoot = resolve(UPLOAD_DIR);

  let failed = 0;
  for (const filePath of paths) {
    const absolutePath = resolve(UPLOAD_DIR, filePath);
    if (!isInsideDir(absolutePath, storageRoot)) {
      console.error(`${logTag} unlink path traversal 차단:`, filePath);
      failed += 1;
      continue;
    }
    try {
      await unlink(absolutePath);
    } catch (err: unknown) {
      // ENOENT 는 이미 정리된 경우라 정상 흐름 (실패 카운트 제외).
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        continue;
      }
      failed += 1;
      console.error(`${logTag} unlink 실패:`, {
        path: relative(UPLOAD_DIR, absolutePath),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failed > 0) {
    logError(
      `${logTag} unlink 부분 실패`,
      new Error(`${failed}/${paths.length} 파일 정리 실패 — cron sweep 으로 회수 예정`),
    );
  }
}
