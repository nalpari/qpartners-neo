"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";
import { isHtmlEmpty } from "@/lib/rich-editor/is-html-empty";
import { Button, DimSpinner, Spinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import type { LoginUser } from "@/lib/schemas/auth";
import { canModifyClient } from "@/lib/auth-client";
import { useTargetLabels, type TargetRoleOption } from "@/hooks/use-target-labels";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { ContentsFormManagement } from "./contents-form-management";
import {
  ContentsFormPostTarget,
  buildInitialPostTargetsState,
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
  /** 사내 사용자에게만 내려옴 — 일반 사용자는 undefined */
  authorIsSuperAdmin?: boolean;
  viewCount: number;
  userId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** 서버에서 계산한 갱신 이력 여부 — createdAt !== updatedAt 시 true. */
  hasBeenUpdated?: boolean;
  /** 게시대상 권한코드 (null = 비회원) */
  targets: { roleCode: string | null; startAt: string | null; endAt: string | null }[];
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

  // 권한 라벨 동기화 — 게시대상 옵션 노출은 운영자가 권한관리에서 정의한 동적 권한.
  // 폼 마운트 시점에 allOptions 가 확정돼야 buildInitialPostTargetsState 가 정확한 행 집합을 만든다.
  const { allOptions, isLoading: isLoadingTargets } = useTargetLabels();

  if (mode === "edit" && isLoadingContent) {
    return (
      <div className="flex items-center justify-center w-full py-20">
        <Spinner size={48} />
      </div>
    );
  }

  if (isLoadingTargets) {
    return (
      <div className="flex items-center justify-center w-full py-20">
        <Spinner size={48} />
      </div>
    );
  }

  // existingData / allOptions 모두 준비된 후 key 로 내부 폼을 리마운트하여 초기값 보장
  return (
    <ContentsFormInner
      key={mode === "edit" ? `edit-${contentId}-${existingData?.updatedAt}` : "create"}
      mode={mode}
      contentId={contentId}
      existingData={existingData ?? undefined}
      allOptions={allOptions}
    />
  );
}

interface ContentsFormInnerProps {
  mode: "create" | "edit";
  contentId?: string;
  existingData?: ContentDetailResponse;
  allOptions: TargetRoleOption[];
}

function ContentsFormInner({ mode, contentId, existingData, allOptions }: ContentsFormInnerProps) {
  const router = useRouter();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // 로그인 사용자 — TanStack Query 캐시 구독 (layout Gnb 가 /auth/login-user-info 로 주입).
  // enabled:false + staleTime:Infinity 로 구독만 하고 fetch 는 Gnb 에 위임.
  const { data: loginUser = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  // edit 진입 권한 — SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
  // 권한 없으면 안내 후 상세 페이지로 되돌림 (URL 직접 입력 시에도 차단)
  // useRef 가드: refetch 로 existingData 참조가 갱신돼도 alert 은 1회만 띄움
  // contentId 가 바뀌면(SPA 전환: /contents/10/edit → /contents/11/edit) ref 를 초기화해 다음 콘텐츠에서 재평가
  const unauthorizedAlertFiredRef = useRef(false);
  useEffect(() => {
    unauthorizedAlertFiredRef.current = false;
  }, [contentId]);
  useEffect(() => {
    if (mode !== "edit" || !existingData || !loginUser) return;
    if (canModifyClient(loginUser, existingData)) return;
    if (unauthorizedAlertFiredRef.current) return;
    unauthorizedAlertFiredRef.current = true;
    openAlert({
      type: "alert",
      message: "このコンテンツを編集する権限がありません。",
      onConfirm: () => router.push(`/contents/${contentId}`),
    });
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
  // 갱신일 — 실제로 수정·저장이 완료된 경우(서버 hasBeenUpdated=true)에만 표시.
  // 최초 등록 직후 수정 화면 진입 시 createdAt===updatedAt 이므로 빈 값을 유지.
  const updateDate =
    mode === "edit" && existingData && existingData.hasBeenUpdated
      ? formatDate(new Date(existingData.updatedAt))
      : "";
  const department = mode === "edit" && existingData
    ? (existingData.authorDepartment ?? "")
    : (loginUser?.deptNm ?? "");

  // forcedRoleCode — 비관리자 작성자/편집자의 본인 권한코드.
  // 본인 콘텐츠가 본인 목록에서 사라지는 회귀 방지 (목록 GET 가 roleCode=user.role 매칭).
  // auth-client.canModifyClient 와 동일 폴백 (authRole 미보유 구 JWT 호환).
  // 사내회원(SUPER_ADMIN/ADMIN) 은 항상 조회 가능하므로 강제 없음 → null.
  const effectiveRole =
    loginUser?.authRole ?? (loginUser?.userTp === "ADMIN" ? "ADMIN" : null);
  const isInternalEditor =
    effectiveRole === "SUPER_ADMIN" || effectiveRole === "ADMIN";
  const forcedRoleCode = !isInternalEditor && effectiveRole ? effectiveRole : null;

  // 폼 상태 — allOptions(권한관리) + existingData + forcedRoleCode 결합으로 초기값 도출.
  // (useEffect setState 대신 key 리마운트 방식; allOptions 변경 시 재마운트로 동기화)
  const initialPostTargets = buildInitialPostTargetsState(
    allOptions,
    existingData?.targets,
    forcedRoleCode,
  );

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

  const handleContentParseError = (error: unknown) => {
    console.error("[Contents] 本文 파싱 실패:", error);
    openAlert({
      type: "alert",
      message: "保存された本文を読み込めませんでした。データが破損している可能性があります。再入力する前にキャンセルし、管理者にお問い合わせください。",
    });
  };

  const handleContentUploadError = (error: unknown) => {
    // 서버가 일본어 메시지를 내려주는 경우 그대로 노출 — 그 외에는 일반화 메시지.
    let message = "画像のアップロードに失敗しました。しばらくしてからお試しください。";
    if (isAxiosError(error) && error.response) {
      const resData: unknown = error.response.data;
      const serverMsg =
        resData != null &&
        typeof resData === "object" &&
        "error" in resData &&
        typeof (resData as { error: unknown }).error === "string"
          ? ((resData as { error: string }).error)
          : null;
      if (serverMsg) message = serverMsg;
    }
    openAlert({ type: "alert", message });
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
    if (isHtmlEmpty(content)) {
      openAlert({ type: "alert", message: "内容は必須入力項目です。" });
      return;
    }
    // 카테고리는 전체 카테고리 중 최소 1개 이상 선택해야 함.
    if (selectedCategoryIds.length === 0) {
      openAlert({ type: "alert", message: "カテゴリを1つ以上選択してください。" });
      return;
    }

    // 게시대상 배열 구성 — roleCode (null = 비회원) 그대로 전송. JSON null 직렬화 OK.
    const targets = postTargets.targets
      .filter((t) => t.checked)
      .map((t) => ({
        roleCode: t.roleCode,
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
      let message = "保存に失敗しました。しばらくしてからお試しください。";
      if (isAxiosError(error) && error.response) {
        const resData: unknown = error.response.data;
        const errorMsg = resData != null && typeof resData === "object" && "error" in resData ? (resData as { error: unknown }).error : undefined;
        console.error("[Contents] 서버 응답 status:", error.response.status, "error:", errorMsg);
        // Validation failed 시 issues 배열의 구체적인 메시지 표시
        if (
          resData != null &&
          typeof resData === "object" &&
          "issues" in resData &&
          Array.isArray((resData as { issues: unknown }).issues)
        ) {
          const issues = (resData as { issues: { message?: string }[] }).issues;
          const messages = issues
            .map((i) => i.message)
            .filter((m): m is string => typeof m === "string");
          if (messages.length > 0) {
            message = messages.join("\n");
          }
        } else if (typeof errorMsg === "string" && errorMsg !== "Validation failed") {
          message = errorMsg;
        }
      }
      setIsSubmitting(false);
      openAlert({ type: "alert", message });
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
          forcedRoleCode={forcedRoleCode}
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
          onContentParseError={handleContentParseError}
          onContentUploadError={handleContentUploadError}
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
