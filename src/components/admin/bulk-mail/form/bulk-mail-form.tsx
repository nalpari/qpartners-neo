"use client";

// Design Ref: §3 — 메일 폼 컴포넌트 (4모드: create/detail/edit/copy)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Button } from "@/components/common";
import { useAlertStore } from "@/lib/store";
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

  const isDetail = mode === "detail";

  // ─── Form State ───
  const senderName = initialData?.senderName ?? DEFAULT_SENDER;
  const [targets, setTargets] = useState<string[]>(initialData?.targets ?? []);
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mass-mails"], refetchType: "all" });
      openAlert({
        type: "alert",
        message: "下書き保存しました。",
        onConfirm: () => {
          router.push("/admin/bulk-mail", { transitionTypes: ["fade"] });
        },
      });
    },
    onError: (error: unknown) => {
      console.error("[BulkMailForm] 임시저장 실패:", error);
      openAlert({ type: "alert", message: "下書き保存に失敗しました。" });
    },
  });

  // Design Ref: §3.3 — 필수항목 검증
  function validate(): string | null {
    if (!senderName.trim()) return "送信者名は必須です。";
    if (targets.length === 0) return "配信対象を1つ以上選択してください。";
    if (!subject.trim()) return "件名は必須です。";
    if (!body.trim()) return "本文は必須です。";
    return null;
  }

  // ─── 버튼 핸들러 (Design Ref: §3.4) ───
  const handleList = () => {
    router.push("/admin/bulk-mail", { transitionTypes: ["fade"] });
  };

  // Plan SC: 配信 → status: pending → 상세로 이동
  const handleSend = () => {
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
          senderName, targets, optOut, subject, body,
          status: "pending", files,
        });
        submitMutation.mutate(fd);
      },
    });
  };

  // Plan SC: 下書き保存 → status: draft (임시저장은 빈 필드 허용 — 의도적 미검증)
  const handleDraft = () => {
    const fd = buildFormData({
      senderName, targets, optOut, subject, body,
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
      openAlert({ type: "alert", message: "削除に失敗しました。" });
    },
  });

  const handleDelete = () => {
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
  const handleCopy = () => {
    const copyData = { senderName, targets, optOut, subject, body };
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
          sentAt={showSentAt && initialData?.sentAt ? formatMailDate(initialData.sentAt) : (showSentAt && initialData?.createdAt ? formatMailDate(initialData.createdAt) : "")}
        />
      </section>

      {/* 발송대상 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormTargets
          targets={targets}
          onTargetsChange={setTargets}
          disabled={isDetail}
        />
      </section>

      {/* 뉴스레터 배송대상 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormNewsletter
          optOut={optOut}
          onOptOutChange={setOptOut}
          disabled={isDetail}
        />
      </section>

      {/* 제목 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormTitle
          title={subject}
          onTitleChange={setSubject}
          disabled={isDetail}
        />
      </section>

      {/* 내용 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormBody
          content={body}
          onContentChange={setBody}
          disabled={isDetail}
        />
      </section>

      {/* 파일첨부 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormAttachment
          files={files}
          onFilesChange={setFiles}
          serverAttachments={initialData?.attachments}
          disabled={isDetail}
        />
      </section>

      {/* 하단 버튼 — 모드별 분기 */}
      <div className="flex items-center justify-end gap-2 w-[1440px] pb-1">
        {isDetail ? (
          <>
            <Button variant="outline" onClick={handleCopy}>
              コピーして作成
            </Button>
            <Button variant="secondary" onClick={handleList}>
              一覧
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleList}>
              一覧
            </Button>
            {mode === "edit" && (
              <Button variant="secondary" onClick={handleDelete} disabled={isPending}>
                削除
              </Button>
            )}
            <Button variant="primary" onClick={handleSend} disabled={isPending}>
              登録
            </Button>
            <Button variant="outline" onClick={handleDraft} disabled={isPending}>
              下書き保存
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
