"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { Button, DimSpinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { canModifyClient } from "@/lib/auth-client";
import type { LoginUser } from "@/lib/schemas/auth";
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

  // Design Ref: §4.1 — 사내 사용자 판별
  const isAdmin = user?.userTp === "ADMIN";
  const isInternal = isAdmin;
  // 삭제/수정 권한: 서버 canModifyResource 로직과 동기화
  // SUPER_ADMIN → 모든 글, ADMIN → SUPER_ADMIN 작성글 제외, 그외 → 본인 글만
  const canModify = data ? canModifyClient(user, data) : false;

  const handleDelete = () => {
    openAlert({
      type: "confirm",
      message: "本当に削除しますか？",
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          await api.delete(`/contents/${contentId}`);
          setIsDeleting(false);
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
