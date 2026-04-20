"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";
import { Button, DimSpinner, Spinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import type { LoginUser } from "@/lib/schemas/auth";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { ContentsFormManagement } from "./contents-form-management";
import {
  ContentsFormPostTarget,
  getInitialPostTargets,
} from "./contents-form-post-target";
import type { PostTargetState } from "./contents-form-post-target";
import { ContentsFormCategory } from "./contents-form-category";
import { ContentsFormEditor } from "./contents-form-editor";
import {
  ContentsFormAttachment,
} from "./contents-form-attachment";
import type { AttachmentFile, SavedAttachment } from "./contents-form-attachment";

// 수정 폼 전용 API 응답 타입 — PUT 응답의 categories 구조가 상세 조회와 다름
// 상세 조회 타입: ContentDetailData (contents-detail.tsx)
interface ContentDetailResponse {
  id: number;
  title: string;
  body: string;
  status: string;
  approverLevel: number | null;
  authorDepartment: string | null;
  authorIsSuperAdmin: boolean;
  viewCount: number;
  userId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  targets: { targetType: string; startAt: string | null; endAt: string | null }[];
  categories: {
    id: number;
    categoryCode: string;
    name: string;
    isInternalOnly: boolean;
    children: { id: number; categoryCode: string; name: string; isInternalOnly: boolean }[];
  }[];
  attachments: { id: number; fileName: string; fileSize: number }[];
}

interface ContentsFormProps {
  mode: "create" | "edit";
  contentId?: string;
}

export function ContentsForm({ mode, contentId }: ContentsFormProps) {
  // 수정 모드: 기존 데이터 로딩 → 로딩 완료 후 key로 내부 폼 리마운트
  const { data: existingData, isLoading: isLoadingContent } = useQuery<ContentDetailResponse>({
    queryKey: ["contents", contentId],
    queryFn: async () => {
      const res = await api.get<{ data: ContentDetailResponse }>(`/contents/${contentId}`);
      return res.data.data;
    },
    enabled: mode === "edit" && !!contentId,
  });

  if (mode === "edit" && isLoadingContent) {
    return (
      <div className="flex items-center justify-center w-full py-20">
        <Spinner size={48} />
      </div>
    );
  }

  // existingData가 준비된 후 key로 내부 폼을 리마운트하여 초기값 보장
  return (
    <ContentsFormInner
      key={mode === "edit" ? `edit-${contentId}-${existingData?.updatedAt}` : "create"}
      mode={mode}
      contentId={contentId}
      existingData={existingData ?? undefined}
    />
  );
}

interface ContentsFormInnerProps {
  mode: "create" | "edit";
  contentId?: string;
  existingData?: ContentDetailResponse;
}

function ContentsFormInner({ mode, contentId, existingData }: ContentsFormInnerProps) {
  const router = useRouter();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // 로그인 사용자 캐시 구독
  const { data: loginUser } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  // edit 진입 권한 — SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
  // 권한 없으면 안내 후 상세 페이지로 되돌림 (URL 직접 입력 시에도 차단)
  useEffect(() => {
    if (mode !== "edit" || !existingData || !loginUser) return;
    const role = loginUser.authRole ?? "ADMIN";
    const canModify = role === "SUPER_ADMIN"
      ? true
      : role === "ADMIN"
        ? !existingData.authorIsSuperAdmin
        : loginUser.userId === existingData.userId;
    if (!canModify) {
      openAlert({
        type: "alert",
        message: "このコンテンツを編集する権限がありません。",
        onConfirm: () => router.push(`/contents/${contentId}`),
      });
    }
  }, [mode, existingData, loginUser, contentId, openAlert, router]);

  // 카테고리 조회
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 관리정보
  const distributor = mode === "edit" && existingData
    ? (existingData.createdBy ?? existingData.userId ?? "")
    : (loginUser?.userNm ?? "");
  const publishDate = mode === "edit" && existingData
    ? formatDate(new Date(existingData.createdAt))
    : formatDate(new Date());
  const updater = mode === "edit" && existingData
    ? (existingData.createdBy ?? "")
    : "";
  const updateDate = mode === "edit" && existingData
    ? formatDate(new Date(existingData.updatedAt))
    : "";
  const department = mode === "edit" && existingData
    ? (existingData.authorDepartment ?? "")
    : (loginUser?.deptNm ?? "");

  // 폼 상태 — existingData에서 직접 초기값 도출 (useEffect setState 대신 key 리마운트 방식)
  const initialPostTargets = (() => {
    if (!existingData?.targets) return getInitialPostTargets();
    const base = getInitialPostTargets();
    return {
      ...base,
      targets: base.targets.map((item) => {
        const existing = existingData.targets.find((t) => t.targetType === item.key);
        if (existing) {
          return {
            ...item,
            checked: true,
            startDate: existing.startAt ? new Date(existing.startAt) : null,
            endDate: existing.endAt ? new Date(existing.endAt) : null,
          };
        }
        return item;
      }),
    };
  })();

  const [approver, setApprover] = useState(existingData ? String(existingData.approverLevel ?? "") : "");
  const [postTargets, setPostTargets] = useState<PostTargetState>(initialPostTargets);
  const initialCategoryIds = existingData?.categories?.flatMap((parent) => parent.children.map((child) => child.id)) ?? [];
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(initialCategoryIds);
  const [title, setTitle] = useState(existingData?.title ?? "");
  const [content, setContent] = useState(existingData?.body ?? "");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [savedFiles, setSavedFiles] = useState<SavedAttachment[]>(existingData?.attachments ?? []);
  const [initialFileIds] = useState(() => existingData?.attachments?.map((a) => a.id) ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleList = () => {
    router.push("/contents", { transitionTypes: ["fade"] });
  };

  const handleSave = async () => {
    // 필수항목 검증
    if (!approver) {
      openAlert({ type: "alert", message: "最終確認者は必須入力項目です。" });
      return;
    }
    if (!title.trim()) {
      openAlert({ type: "alert", message: "タイトルは必須入力項目です。" });
      return;
    }
    if (!content.trim()) {
      openAlert({ type: "alert", message: "内容は必須入力項目です。" });
      return;
    }
    if (attachments.length === 0 && mode === "create") {
      openAlert({ type: "alert", message: "ファイル添付は必須入力項目です。" });
      return;
    }

    // 게시대상 배열 구성
    const targets = postTargets.targets
      .filter((t) => t.checked)
      .map((t) => ({
        targetType: t.key,
        ...(t.startDate && { startAt: t.startDate.toISOString() }),
        ...(t.endDate && { endAt: t.endDate.toISOString() }),
      }));

    // 삭제된 첨부파일 ID 산출
    const currentFileIds = new Set(savedFiles.map((f) => f.id));
    const deleteAttachmentIds = initialFileIds.filter((id) => !currentFileIds.has(id));

    const requestBody = {
      title,
      body: content,
      status: "published" as const,
      approverLevel: Number(approver),
      authorDepartment: department,
      targets,
      categoryIds: selectedCategoryIds,
      ...(deleteAttachmentIds.length > 0 && { deleteAttachmentIds }),
    };

    setIsSubmitting(true);
    try {
      let savedId: number;

      if (mode === "create") {
        const res = await api.post<{ data: { id: number } }>("/contents", requestBody);
        savedId = res.data.data.id;
      } else {
        await api.put(`/contents/${contentId}`, requestBody);
        savedId = Number(contentId);
      }

      // 파일 업로드 (새 파일)
      if (attachments.length > 0) {
        try {
          const formData = new FormData();
          attachments.forEach((f) => formData.append("files", f.file));
          await api.post(`/contents/${savedId}/files`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (uploadError: unknown) {
          console.error("[Contents] 파일 업로드 실패:", uploadError);
          setIsSubmitting(false);
          openAlert({
            type: "alert",
            message: "コンテンツは保存されましたが、ファイルのアップロードに失敗しました。詳細画面から再度お試しください。",
            onConfirm: () => router.push(`/contents/${savedId}`),
          });
          return;
        }
      }

      setIsSubmitting(false);
      // 저장 완료 후 캐시 무효화 — 상세/목록 페이지에서 최신 데이터 표시
      queryClient.invalidateQueries({ queryKey: ["contents", String(savedId)] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
      openAlert({
        type: "alert",
        message: "保存されました。",
        onConfirm: () => router.push(`/contents/${savedId}`),
      });
    } catch (error: unknown) {
      console.error("[Contents] 저장 실패:", error);
      if (isAxiosError(error) && error.response) {
        const resData: unknown = error.response.data;
        const errorMsg = resData != null && typeof resData === "object" && "error" in resData ? (resData as { error: unknown }).error : undefined;
        console.error("[Contents] 서버 응답 status:", error.response.status, "error:", errorMsg);
      }
      setIsSubmitting(false);
      openAlert({ type: "alert", message: "保存に失敗しました。しばらくしてからお試しください。" });
    }
  };

  // 수정 모드 로딩 중
  return (
    <>
      {isSubmitting && <DimSpinner />}
      <main className="flex flex-col items-center gap-[18px] w-full pb-[120px]">
        <ContentsFormManagement
          distributor={distributor}
          publishDate={publishDate}
          updater={updater}
          updateDate={updateDate}
          department={department}
          approver={approver}
          onApproverChange={setApprover}
        />

        <ContentsFormPostTarget
          postTargets={postTargets}
          onPostTargetsChange={setPostTargets}
        />

        <ContentsFormCategory
          categories={categories}
          selectedIds={selectedCategoryIds}
          onSelectedIdsChange={setSelectedCategoryIds}
        />

        <ContentsFormEditor
          title={title}
          onTitleChange={setTitle}
          content={content}
          onContentChange={setContent}
        />

        <ContentsFormAttachment
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          savedFiles={savedFiles}
          onSavedFilesChange={setSavedFiles}
          contentId={contentId}
        />

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-[6px] w-[1440px]">
          <Button variant="secondary" onClick={handleList}>
            リスト
          </Button>
          <Button
            variant="primary"
            onClick={() => { void handleSave(); }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </main>
    </>
  );
}
