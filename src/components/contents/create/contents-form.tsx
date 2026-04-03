"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/common";
import { Spinner } from "@/components/common/spinner";
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
import type { AttachmentFile } from "./contents-form-attachment";

// API 응답 타입 (GET /api/contents/{id})
interface ContentDetailResponse {
  id: number;
  title: string;
  body: string;
  status: string;
  approverLevel: number | null;
  authorDepartment: string | null;
  viewCount: number;
  userId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  targets: { targetType: string; startAt: string | null; endAt: string | null }[];
  categories: { categoryId: number; category: { id: number; name: string } }[];
  attachments: { id: number; fileName: string; fileSize: number }[];
}

interface ContentsFormProps {
  mode: "create" | "edit";
  contentId?: string;
}

export function ContentsForm({ mode, contentId }: ContentsFormProps) {
  const router = useRouter();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // 로그인 사용자 캐시
  const loginUser = queryClient.getQueryData<LoginUser>(["auth", "login-user-info"]);

  // 카테고리 조회
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 수정 모드: 기존 데이터 로딩
  const { data: existingData, isLoading: isLoadingContent } = useQuery<ContentDetailResponse>({
    queryKey: ["contents", contentId],
    queryFn: async () => {
      const res = await api.get<{ data: ContentDetailResponse }>(`/contents/${contentId}`);
      return res.data.data;
    },
    enabled: mode === "edit" && !!contentId,
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

  // 폼 상태
  const [approver, setApprover] = useState("");
  const [postTargets, setPostTargets] = useState<PostTargetState>(getInitialPostTargets());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 수정 모드: 기존 데이터 → 폼에 세팅
  useEffect(() => {
    if (mode !== "edit" || !existingData) return;

    setTitle(existingData.title ?? "");
    setContent(existingData.body ?? "");
    setApprover(String(existingData.approverLevel ?? ""));

    // 카테고리 ID
    if (existingData.categories) {
      setSelectedCategoryIds(
        existingData.categories.map((c) => c.categoryId)
      );
    }

    // 게시대상 — 기존 targets로 PostTargetState 구성
    if (existingData.targets) {
      const initial = getInitialPostTargets();
      const updatedTargets = initial.targets.map((item) => {
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
      });
      setPostTargets({ ...initial, targets: updatedTargets });
    }
  }, [mode, existingData]);

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

    const requestBody = {
      title,
      body: content,
      status: "published" as const,
      approverLevel: Number(approver),
      authorDepartment: department,
      targets,
      categoryIds: selectedCategoryIds,
    };

    setIsSubmitting(true);
    try {
      let savedId: number;

      if (mode === "create") {
        const res = await api.post("/contents", requestBody);
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
        } catch (uploadError) {
          console.error("[Contents] ファイルアップロード失敗:", uploadError);
          openAlert({
            type: "alert",
            message: "コンテンツは保存されましたが、ファイルのアップロードに失敗しました。詳細画面から再度お試しください。",
          });
          router.push(`/contents/${savedId}`, { transitionTypes: ["fade"] });
          return;
        }
      }

      openAlert({ type: "alert", message: "保存されました。" });
      router.push(`/contents/${savedId}`, { transitionTypes: ["fade"] });
    } catch (error) {
      console.error("[Contents] 保存失敗:", error);
      // TODO: 디버깅용 — 추후 제거
      if (error && typeof error === "object" && "response" in error) {
        const axiosErr = error as { response?: { data?: unknown } };
        console.error("[Contents] サーバー応答:", JSON.stringify(axiosErr.response?.data, null, 2));
      }
      console.error("[Contents] リクエストボディ:", JSON.stringify(requestBody, null, 2));
      openAlert({ type: "alert", message: "保存に失敗しました。しばらくしてからお試しください。" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 수정 모드 로딩 중
  if (mode === "edit" && isLoadingContent) {
    return (
      <div className="flex items-center justify-center w-full py-20">
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <>
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Spinner size={48} className="text-white" />
        </div>
      )}
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
