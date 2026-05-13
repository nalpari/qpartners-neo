"use client";

// Design Ref: §3 — 메일 폼 컴포넌트 (4모드: create/detail/edit/copy)

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { Button } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { ADMIN_MENU } from "@/lib/menu-codes";
import { isHtmlEmpty } from "@/lib/rich-editor/is-html-empty";
import {
  bodyHasSignature,
  stripSignatureLines,
} from "@/components/admin/bulk-mail/bulk-mail-types";
import { BulkMailFormInfo } from "./bulk-mail-form-info";
import { BulkMailFormTargets, BulkMailFormNewsletter } from "./bulk-mail-form-targets";
import { BulkMailFormTitle, BulkMailFormBody } from "./bulk-mail-form-content";
import { BulkMailFormAttachment } from "./bulk-mail-form-attachment";
import type {
  FormMode,
  FormInitialData,
  MassMailCreateResponse,
} from "@/components/admin/bulk-mail/bulk-mail-types";
import { buildFormData, formatMailDate, FORM_DATA_CONFIG } from "@/components/admin/bulk-mail/bulk-mail-types";

const DEFAULT_SENDER = "Q.PARTNERS事務局 (q.partners@hqj.co.jp)";

interface BulkMailFormProps {
  mode: FormMode;
  initialData?: Partial<FormInitialData>;
}

export function BulkMailForm({ mode, initialData }: BulkMailFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { openAlert } = useAlertStore();

  // RBAC 표준 패턴 — ADM_BULK_MAIL 매트릭스 가드. 폼 컴포넌트 단일 호출 후 자식(form-info/targets/title/body/attachment) 에 prop 으로 readonly 전달.
  // 자식 별도 호출 시 isLoading 깜빡임 발생 가능 — 부모 단일 호출로 통일 (PR #148 리뷰 학습).
  // 로딩 중 fail-closed (isPermLoading 시 readonly). 서버 가드(requireMenuPermission) 가 최종 검증.
  const {
    canCreate: canCreateMail,
    canUpdate: canUpdateMail,
    canDelete: canDeleteMail,
    isLoading: isPermLoading,
  } = useMenuPermission(ADMIN_MENU.BULK_MAIL);

  const isDetail = mode === "detail";
  // mode 별 가드 액션 — edit → update, 그 외(create/copy) → create.
  // detail 모드는 입력 폼 비활성이라 mutate 자체가 호출되지 않음.
  const isEditMode = mode === "edit";
  const hasRequiredPerm = isEditMode ? canUpdateMail : canCreateMail;
  // RBAC readonly — 폼 입력 필드 비활성. detail 은 항상 readonly, 그 외에는 권한 기반.
  const isPermReadOnly = isPermLoading || !hasRequiredPerm;
  const isFormDisabled = isDetail || isPermReadOnly;

  // ─── Form State ───
  const senderName = initialData?.senderName ?? DEFAULT_SENDER;
  const [targetRoleCodes, setTargetRoleCodes] = useState<string[]>(
    initialData?.targetRoleCodes ?? [],
  );
  const [optOut, setOptOut] = useState(initialData?.optOut ?? false);
  const [subject, setSubject] = useState(initialData?.subject ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [files, setFiles] = useState<File[]>([]);

  const editId = initialData?.id;

  // Design Ref: §3.2 — 공통 mutationFn (edit → PUT, 그 외 → POST)
  const submitToApi = (fd: FormData) =>
    mode === "edit" && editId
      ? api.put<MassMailCreateResponse>(`/admin/mass-mails/${editId}`, fd, FORM_DATA_CONFIG)
      : api.post<MassMailCreateResponse>("/admin/mass-mails", fd, FORM_DATA_CONFIG);

  const submitMutation = useMutation({
    mutationFn: submitToApi,
    onSuccess: (res) => {
      const { id, message } = res.data.data;
      void queryClient.invalidateQueries({ queryKey: ["mass-mails"], refetchType: "all" });
      openAlert({
        type: "alert",
        message,
        onConfirm: () => {
          router.push(`/admin/bulk-mail/${id}`, { transitionTypes: ["fade"] });
        },
      });
    },
    onError: (error: unknown) => {
      console.error("[BulkMailForm] 메일 등록 실패:", error);
      openAlert({ type: "alert", message: "メールの登録に失敗しました。" });
    },
  });

  const draftMutation = useMutation({
    mutationFn: submitToApi,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["mass-mails"], refetchType: "all" });
      // Issue #2177 (1) — 임시저장 후 현재 화면 유지.
      // create/copy 모드: 같은 ID 의 편집 화면으로 replace (URL 만 갱신, 폼 유지).
      // edit 모드: 라우팅 없이 상세 쿼리만 invalidate 하여 첨부/메타 갱신 반영.
      const { id } = res.data.data;
      openAlert({
        type: "alert",
        message: "下書き保存しました。",
        onConfirm: () => {
          if (mode === "edit") {
            void queryClient.invalidateQueries({
              queryKey: ["mass-mails", String(editId)],
              refetchType: "all",
            });
          } else {
            router.replace(`/admin/bulk-mail/${id}`, { transitionTypes: ["fade"] });
          }
        },
      });
    },
    onError: (error: unknown) => {
      console.error("[BulkMailForm] 임시저장 실패:", error);
      openAlert({ type: "alert", message: "下書き保存に失敗しました。" });
    },
  });

  // Design Ref: §3.3 — 필수항목 검증
  // Issue #2177 (2) — 메시지 형식 통일: "{項目名}は必須入力項目です。"
  function validate(): string | null {
    if (!senderName.trim()) return "送信者名は必須入力項目です。";
    if (targetRoleCodes.length === 0) return "配信対象は必須入力項目です。";
    if (!subject.trim()) return "件名は必須入力項目です。";
    // RichEditor 도입으로 body 는 HTML 문자열. 빈 <p></p> 는 trim 으로 못 거르므로 isHtmlEmpty 사용.
    if (isHtmlEmpty(body)) return "本文は必須入力項目です。";
    // 사무국 서명만 채워진 채 발송되는 케이스 차단 — 서명 라인 제거 후에도 의미 있는 텍스트가 남아야 통과.
    // bodyHasSignature 가 false 면(레거시 본문 등) 서명-only 가 아니므로 검사 생략.
    if (bodyHasSignature(body) && isHtmlEmpty(stripSignatureLines(body))) {
      return "本文は必須入力項目です。";
    }
    return null;
  }

  // RichEditor 본문 파싱/이미지 업로드 실패 핸들러 — contents-form 과 동일 패턴.
  const handleBodyParseError = useCallback((error: unknown) => {
    console.error("[BulkMailForm] 本文 파싱 실패:", error);
    openAlert({
      type: "alert",
      message: "保存された本文を読み込めませんでした。データが破損している可能性があります。再入力する前にキャンセルし、管理者にお問い合わせください。",
    });
  }, [openAlert]);

  // 서버 응답 메시지를 그대로 UI 에 노출하지 않음 (api.md: 외부/내부 API 에러 직접 노출 금지).
  // 원본 에러는 콘솔에만 남기고, 사용자에게는 일반화된 메시지를 표시.
  const handleBodyUploadError = useCallback((error: unknown) => {
    console.error("[BulkMailForm] 本文 画像アップロード 실패:", error);
    openAlert({
      type: "alert",
      message: "画像のアップロードに失敗しました。しばらくしてからお試しください。",
    });
  }, [openAlert]);

  // ─── 버튼 핸들러 (Design Ref: §3.4) ───
  const handleList = () => {
    router.push("/admin/bulk-mail", { transitionTypes: ["fade"] });
  };

  // Plan SC: 配信 → status: pending → 상세로 이동
  // RBAC 패턴 E — mode 별 액션 분기 (edit=update, create/copy=create). 로딩 중은 silent return.
  const handleSend = () => {
    if (isPermLoading) return;
    if (!hasRequiredPerm) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    const error = validate();
    if (error) {
      openAlert({ type: "alert", message: error });
      return;
    }
    openAlert({
      type: "confirm",
      message: "メールを配信しますか？",
      confirmLabel: "配信",
      cancelLabel: "キャンセル",
      onConfirm: () => {
        const fd = buildFormData({
          senderName, targetRoleCodes, optOut, subject, body,
          status: "pending", files,
        });
        submitMutation.mutate(fd);
      },
    });
  };

  // Plan SC: 下書き保存 → status: draft
  // Issue #2177 (2) — 필수항목 미입력 시 alert 으로 항목별 메시지 표시.
  // RBAC 패턴 E — handleSend 와 동일 액션 (draft 는 status 만 다름, BE 가드는 동일 menuCode/action).
  const handleDraft = () => {
    if (isPermLoading) return;
    if (!hasRequiredPerm) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    const error = validate();
    if (error) {
      openAlert({ type: "alert", message: error });
      return;
    }
    const fd = buildFormData({
      senderName, targetRoleCodes, optOut, subject, body,
      status: "draft", files,
    });
    draftMutation.mutate(fd);
  };

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!editId) throw new Error("削除対象のIDがありません");
      return api.delete(`/admin/mass-mails/${editId}`);
    },
    onSuccess: () => {
      // 삭제된 상세 쿼리를 즉시 제거하여 404 refetch 방지
      queryClient.removeQueries({ queryKey: ["mass-mails", String(editId)] });
      openAlert({
        type: "alert",
        message: "削除しました。",
        onConfirm: () => {
          void queryClient.invalidateQueries({ queryKey: ["mass-mails"], refetchType: "all" });
          router.push("/admin/bulk-mail", { transitionTypes: ["fade"] });
        },
      });
    },
    onError: (error: unknown) => {
      console.error("[BulkMailForm] 메일 삭제 실패:", error);
      // 백엔드가 돌려준 사유(소유권/상태 등)를 그대로 노출해 IDOR 방어 메시지가
      // 관리자에게 정확히 전달되도록 함
      const backendMessage =
        isAxiosError<{ error?: string }>(error) ? error.response?.data?.error : undefined;
      openAlert({ type: "alert", message: backendMessage ?? "削除に失敗しました。" });
    },
  });

  // RBAC 패턴 E — 削除 액션 가드. 로딩 중은 silent return.
  const handleDelete = () => {
    if (isPermLoading) return;
    if (!canDeleteMail) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    openAlert({
      type: "confirm",
      message: "下書きを削除しますか？",
      confirmLabel: "削除",
      cancelLabel: "キャンセル",
      onConfirm: () => {
        deleteMutation.mutate();
      },
    });
  };

  // Plan SC: コピーして作成 → sessionStorage에 저장 → 등록 화면 이동
  // RBAC 패턴 E — 새 메일 등록 화면 진입 시 create 권한 필수. 페이지 가드(server)가 최종 차단하지만
  // sessionStorage 에 카피 데이터를 적재하기 전에 권한 없는 사용자 진입을 즉시 막아 UX 명확화.
  const handleCopy = () => {
    if (isPermLoading) return;
    if (!canCreateMail) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    const copyData = { senderName, targetRoleCodes, optOut, subject, body };
    try {
      sessionStorage.setItem("mass-mail-copy", JSON.stringify(copyData));
    } catch (error: unknown) {
      console.warn("[BulkMailForm] sessionStorage 저장 실패:", error);
      openAlert({ type: "alert", message: "コピーデータの保存に失敗しました。" });
      return;
    }
    router.push("/admin/bulk-mail/create", { transitionTypes: ["fade"] });
  };

  const isPending = submitMutation.isPending || draftMutation.isPending || deleteMutation.isPending;
  const showSentAt = mode === "detail" || mode === "edit";

  const cardClass = "bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]";

  return (
    <div className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      {/* 관리 정보 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormInfo
          senderName={senderName}
          createdBy={initialData?.createdBy ?? ""}
          createdByName={initialData?.createdByName ?? null}
          sentAt={showSentAt && initialData?.sentAt ? formatMailDate(initialData.sentAt) : (showSentAt && initialData?.createdAt ? formatMailDate(initialData.createdAt) : "")}
        />
      </section>

      {/* 발송대상 카드 — RBAC: detail 모드 또는 권한 readonly 시 비활성 (패턴 C) */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormTargets
          targetRoleCodes={targetRoleCodes}
          onTargetRoleCodesChange={setTargetRoleCodes}
          disabled={isFormDisabled}
        />
      </section>

      {/* 뉴스레터 배송대상 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormNewsletter
          optOut={optOut}
          onOptOutChange={setOptOut}
          disabled={isFormDisabled}
        />
      </section>

      {/* 제목 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormTitle
          title={subject}
          onTitleChange={setSubject}
          disabled={isFormDisabled}
        />
      </section>

      {/* 내용 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormBody
          mode={mode}
          content={body}
          onContentChange={setBody}
          disabled={isFormDisabled}
          onContentParseError={handleBodyParseError}
          onContentUploadError={handleBodyUploadError}
        />
      </section>

      {/* 파일첨부 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormAttachment
          files={files}
          onFilesChange={setFiles}
          serverAttachments={initialData?.attachments}
          disabled={isFormDisabled}
        />
      </section>

      {/* 하단 버튼 — 모드별 분기. RBAC 패턴 A (미노출) + 핸들러 본체 패턴 E 이중 가드. #2183 note-12 통일 */}
      <div className="flex items-center justify-end gap-2 w-[1440px] pb-1">
        {isDetail ? (
          <>
            {/* コピーして作成 — RBAC 패턴 A (canCreate=false 시 미노출). */}
            {!isPermLoading && canCreateMail && (
              <Button
                variant="outline"
                onClick={handleCopy}
              >
                コピーして作成
              </Button>
            )}
            <Button variant="secondary" onClick={handleList}>
              一覧
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleList}>
              一覧
            </Button>
            {mode === "edit" && !isPermLoading && canDeleteMail && (
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={isPending}
              >
                削除
              </Button>
            )}
            {/* 登録 — RBAC 패턴 A (mode 별 분기 미노출). edit=update, create/copy=create */}
            {!isPermReadOnly && (
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={isPending}
              >
                登録
              </Button>
            )}
            {/* 下書き保存 — handleSend 와 동일 액션, 동일 권한 가드 */}
            {!isPermReadOnly && (
              <Button
                variant="outline"
                onClick={handleDraft}
                disabled={isPending}
              >
                下書き保存
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
