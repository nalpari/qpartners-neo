"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { Button, DimSpinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import type { LoginUser } from "@/lib/schemas/auth";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { ContentsDetailInfo } from "./contents-detail-info";
import { ContentsDetailTarget } from "./contents-detail-target";
import { ContentsDetailCategory } from "./contents-detail-category";
import { ContentsDetailBody } from "./contents-detail-body";
import { ContentsDetailAttachment } from "./contents-detail-attachment";

// Design Ref: §2 — API Response Type
interface ContentDetailData {
  id: number;
  userType: string;
  userId: string;
  authorDepartment: string | null;
  approverLevel: number | null;
  title: string;
  body: string | null;
  status: string;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string | null;
  targets: {
    id: number;
    targetType: string;
    startAt: string | null;
    endAt: string | null;
  }[];
  categories: {
    id: number;
    name: string;
    categoryCode: string;
    isInternalOnly: boolean;
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
  const queryClient = useQueryClient();

  // Design Ref: §3.2 — 로그인 사용자 캐시 조회
  const user = queryClient.getQueryData<LoginUser>(["auth", "login-user-info"]);

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
  // 삭제/수정 권한: 서버 canModifyContent 로직과 동기화
  // SUPER_ADMIN → 동일 부문, ADMIN(또는 authRole 미설정) → 본인 등록
  const canModify = (() => {
    if (!isAdmin || !data || !user) return false;
    const role = user.authRole ?? "ADMIN"; // 과도기 JWT 폴백 (middleware와 동일)
    if (role === "SUPER_ADMIN") {
      return !!user.deptNm && !!data.authorDepartment && user.deptNm === data.authorDepartment;
    }
    if (role === "ADMIN") {
      return user.userId === data.userId;
    }
    return false;
  })();

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
          updatedBy={data.updatedBy}
          approverLevel={data.approverLevel}
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

        {/* 하단 버튼 */}
        <div className="flex items-center gap-2 w-full lg:w-[1440px] px-6 lg:px-0 pt-[14px] lg:pt-1 pb-7 lg:pb-1 justify-end">
          {canModify && (
            <>
              <Button
                variant="secondary"
                onClick={handleDelete}
                className="flex-1 lg:flex-none lg:w-[68px]"
              >
                削除
              </Button>
              <Button
                variant="secondary"
                onClick={handleEdit}
                className="!hidden lg:!inline-flex lg:w-[68px]"
              >
                修正
              </Button>
            </>
          )}
          <Button
            variant="primary"
            onClick={handleList}
            className="flex-1 lg:flex-none lg:w-[71px]"
          >
            リスト
          </Button>
        </div>
      </main>
    </>
  );
}
