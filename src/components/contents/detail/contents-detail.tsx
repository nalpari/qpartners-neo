"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { Button, DimSpinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { canModifyClient } from "@/lib/auth-client";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { MENU } from "@/lib/menu-codes";
import type { LoginUser } from "@/lib/schemas/auth";
import { useIsInternal } from "@/hooks/use-is-internal";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { ContentsDetailInfo } from "./contents-detail-info";
import { ContentsDetailTarget } from "./contents-detail-target";
import { ContentsDetailCategory } from "./contents-detail-category";
import { ContentsDetailBody } from "./contents-detail-body";
import { ContentsDetailAttachment } from "./contents-detail-attachment";
import { ContentsDetailActions } from "./contents-detail-actions";

// Design Ref: §2 — API Response Type
interface ContentDetailData {
  id: number;
  userType: string;
  userId: string;
  authorDepartment: string | null;
  /** 사내 사용자(ADMIN userTp)에게만 내려옴. 일반 사용자는 undefined — admin 메타데이터 노출 방지 */
  authorIsSuperAdmin?: boolean;
  approverLevel: number | null;
  title: string;
  body: string | null;
  status: string;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  createdBy: string;
  /** 사내 사용자에게만 내려옴. QSP 조회 실패·비사내 요청 시 undefined */
  createdByName?: string | null;
  updatedAt: string;
  updatedBy: string | null;
  /** 사내 사용자에게만 내려옴. QSP 조회 실패·비사내 요청 시 undefined */
  updatedByName?: string | null;
  /** 서버 단일 출처 — 최초 등록 이후 1회 이상 갱신 여부 */
  hasBeenUpdated: boolean;
  targets: {
    id: number;
    targetType: string;
    startAt: string | null;
    endAt: string | null;
  }[];
  categories: {
    id: number;
    categoryCode: string;
    name: string;
    isInternalOnly: boolean;
    children: { id: number; categoryCode: string; name: string; isInternalOnly: boolean }[];
  }[];
  attachments: {
    id: number;
    fileName: string;
    fileSize: number | null;
    mimeType: string | null;
    sortOrder: number;
  }[];
  isNew: boolean;
  isUpdated: boolean;
}

interface ContentsDetailProps {
  contentId: string;
}

export type { ContentDetailData };

export function ContentsDetail({ contentId }: ContentsDetailProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { openAlert } = useAlertStore();
  const [isDeleting, setIsDeleting] = useState(false);

  // Design Ref: §3.2 — 로그인 사용자 캐시 구독 (auth 상태 변경 시 리렌더링 보장)
  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  // Design Ref: §3.1 — API 데이터 조회
  const { data, isLoading, error } = useQuery<ContentDetailData>({
    queryKey: ["contents", contentId],
    queryFn: async () => {
      const res = await api.get<{ data: ContentDetailData }>(`/contents/${contentId}`);
      return res.data.data;
    },
  });

  // 카테고리 트리 조회 (카테고리 그룹 표시용)
  const { data: categoryTree = [] } = useQuery<CategoryNode[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Design Ref: §4.1 — 사내 사용자 판별 (UI hint 전용)
  // ⚠️ 서버 truth source: PUT/DELETE 는 requireAdmin + canModifyResource 로 재검증됨.
  //    본 플래그는 버튼/라벨 노출 제어만 담당. 클라이언트 조작으로 버튼을 강제 노출해도 서버가 거부.
  // hydration-safe: SSR/초기 hydration 은 false → Gnb 의 auth flag 전파 후 재평가
  const isInternal = useIsInternal();
  // 삭제/수정 버튼 노출: 서버 canModifyResource 로직을 UI 에 반영 (서버 재검증 보장 전제)
  // SUPER_ADMIN → 모든 글, ADMIN → SUPER_ADMIN 작성글 제외, 그외 → 본인 글만
  const canModify = data ? canModifyClient(user, data) : false;

  // RBAC Phase 3 §버튼 정책: 작성자 가드(canModify) 통과한 버튼에 한해 메뉴 권한 alert 가드.
  // CONTENT menuCode 의 canUpdate/canDelete 가 false 면 클릭 시 "権限がありません。"
  // 권한 로딩 중에는 서버 재검증이 최종 장벽이므로 진행 허용 (로딩 플래시 차단).
  const { canUpdate, canDelete, isLoading: isPermLoading } = useMenuPermission(MENU.CONTENT);

  const handleDelete = () => {
    if (!isPermLoading && !canDelete) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    openAlert({
      type: "confirm",
      message: "本当に削除しますか？",
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          await api.delete(`/contents/${contentId}`);
          setIsDeleting(false);
          // 삭제된 콘텐츠가 목록에 잔존하지 않도록 캐시 무효화 — 목록 페이지 진입 시 재조회.
          // predicate 로 ["contents", <listParams...>] 패턴만 선택 (상세 단건 쿼리 불필요 invalidate 회피).
          await queryClient.invalidateQueries({
            predicate: (q) => {
              const [root, second] = q.queryKey;
              // 상세 쿼리(["contents", contentId:string]) 는 제외 — 직후 페이지 이탈로 무의미
              return root === "contents" && typeof second !== "string";
            },
          });
          openAlert({
            type: "alert",
            message: "削除されました。",
            onConfirm: () => router.push("/contents"),
          });
        } catch (err: unknown) {
          console.error("[Contents] 삭제 실패:", err);
          setIsDeleting(false);
          const status = isAxiosError(err) ? err.response?.status : null;
          const message = status === 403
            ? "このコンテンツを削除する権限がありません。"
            : "削除に失敗しました。";
          openAlert({ type: "alert", message });
        }
      },
    });
  };

  const handleEdit = () => {
    if (!isPermLoading && !canUpdate) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    router.push(`/contents/${contentId}/edit`);
  };

  const handleList = () => {
    router.push("/contents");
  };

  // Design Ref: §6 — 로딩/에러 상태 처리
  if (isLoading) {
    return <DimSpinner />;
  }

  if (error || !data) {
    const status = isAxiosError(error) ? error.response?.status : null;
    const message =
      status === 404
        ? "コンテンツが見つかりません。"
        : status === 403
          ? "このコンテンツへのアクセス権限がありません。"
          : "データの読み込みに失敗しました。";

    return (
      <main className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="font-['Noto_Sans_JP'] text-[16px] text-[#505050]">{message}</p>
        <Button variant="primary" onClick={handleList}>
          リスト
        </Button>
      </main>
    );
  }

  return (
    <>
      {isDeleting && <DimSpinner />}
      <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full lg:pb-[120px]">
        <ContentsDetailInfo
          viewCount={data.viewCount}
          authorDepartment={data.authorDepartment}
          createdBy={data.createdBy}
          createdByName={data.createdByName ?? null}
          updatedBy={data.updatedBy}
          updatedByName={data.updatedByName ?? null}
          approverLevel={data.approverLevel}
          showManagement={isInternal}
          actions={
            <ContentsDetailActions
              canModify={canModify}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onList={handleList}
            />
          }
        />

        {isInternal && (
          <ContentsDetailTarget targets={data.targets} />
        )}

        <ContentsDetailCategory
          categories={data.categories}
          categoryTree={categoryTree}
          isInternal={isInternal}
        />

        <ContentsDetailBody
          title={data.title}
          createdAt={data.createdAt}
          updatedAt={data.updatedAt}
          hasBeenUpdated={data.hasBeenUpdated}
          body={data.body}
        />

        <ContentsDetailAttachment
          contentId={data.id}
          attachments={data.attachments}
        />

        {/* 하단 기능 버튼 */}
        <ContentsDetailActions
          canModify={canModify}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onList={handleList}
          className="w-full lg:w-[1440px] px-6 lg:px-0 pt-[14px] lg:pt-1 pb-7 lg:pb-1 justify-end"
        />
      </main>
    </>
  );
}
