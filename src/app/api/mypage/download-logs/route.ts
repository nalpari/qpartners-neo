import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AUTH_ROLE_TO_TARGET, getFallbackRole, isInternalUser } from "@/lib/auth";
import { getUserFromRequest } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { downloadLogsQuerySchema } from "@/lib/schemas/content";

// GET /api/mypage/download-logs — 다운로드 기록 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }

    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = downloadLogsQuerySchema.safeParse(params);

    if (!query.success) {
      console.warn("[GET /api/mypage/download-logs] 입력값 검증 실패", query.error.issues);
      return NextResponse.json(
        { error: "入力内容に不備があります" },
        { status: 400 },
      );
    }

    const { page, pageSize, keyword } = query.data;

    const where = {
      userType: user.userTp,
      userId: user.userId,
      ...(keyword && {
        OR: [
          { content: { title: { contains: keyword } } },
          { attachment: { fileName: { contains: keyword } } },
        ],
      }),
    };

    const [logs, totalCount] = await Promise.all([
      prisma.downloadLog.findMany({
        where,
        include: {
          content: {
            select: {
              title: true,
              status: true,
              // targetType: 본인 그룹 매칭에 필수.
              // startAt: 향후 "公開予定" 표시 등 확장에 대비해 select 만 유지.
              targets: { select: { targetType: true, startAt: true, endAt: true } },
            },
          },
          attachment: { select: { fileName: true } },
        },
        orderBy: { downloadedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.downloadLog.count({ where }),
    ]);

    // 사용자별 targetType 1회 산출 — loop 내 재계산 회피.
    // - 사내(ADMIN/SUPER_ADMIN): 만료 개념 없음 → null (canAccessContent 와 동일 정책)
    // - 외부 사용자: authRole(없으면 userTp 폴백) → AUTH_ROLE_TO_TARGET 매핑.
    //   매핑 결과 없거나 userTp 폴백 실패(null) → "non_member"
    const userRole = user.authRole ?? getFallbackRole(user.userTp);
    const userTargetType = userRole && isInternalUser(userRole)
      ? null
      : (userRole ? AUTH_ROLE_TO_TARGET[userRole] ?? "non_member" : "non_member");

    const now = new Date();
    const list = logs.map((log) => {
      // 取消線(사양): 열람기간이 지났거나 삭제된 경우에 한정.
      // - status !== "published" → 삭제/draft 로 간주
      // - 사내 사용자(userTargetType === null): 항상 열람 가능 → false
      // - 외부 사용자: 본인 그룹 target 의 endAt 만으로 판정. "시작 전(startAt > now)" 은
      //   사양상 만료가 아니므로 false 처리. 본인 그룹 미지정도 더 이상 본인 자격 없음 → true.
      const isExpired = (() => {
        if (log.content.status !== "published") return true;
        if (userTargetType === null) return false;
        const myTarget = log.content.targets.find((t) => t.targetType === userTargetType);
        if (!myTarget) return true;
        if (myTarget.endAt !== null && myTarget.endAt < now) return true;
        return false;
      })();

      return {
        id: log.id,
        downloadedAt: log.downloadedAt,
        contentId: log.contentId,
        contentTitle: log.content.title,
        attachmentId: log.attachmentId,
        // 첨부파일이 삭제된 경우(attachmentId=null) 표시용 폴백 — 다운로드 이력은 보존
        fileName: log.attachment?.fileName ?? "(削除されたファイル)",
        isExpired,
      };
    });

    return NextResponse.json({
      data: {
        totalCount,
        page,
        pageSize,
        keyword: keyword ?? null,
        list,
      },
    });
  } catch (error) {
    console.error("[GET /api/mypage/download-logs] 다운로드 기록 목록 조회 실패", error);
    return NextResponse.json(
      { error: "ダウンロード履歴の取得に失敗しました" },
      { status: 500 },
    );
  }
}
