"use client";

// Design Ref: §3 — 등록 API 연동 (4모드: create/detail/edit/copy)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
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
import { buildFormData, FORM_DATA_CONFIG } from "@/components/admin/bulk-mail/bulk-mail-types";

const DEFAULT_SENDER = "Q.PARTNERS事務局 (q.partners@hqj.co.jp)";

interface BulkMailFormProps {
  mode: FormMode;
  initialData?: Partial<FormInitialData>;
}

export function BulkMailForm({ mode, initialData }: BulkMailFormProps) {
  const router = useRouter();
  const { openAlert } = useAlertStore();

  const isDetail = mode === "detail";
  const isEditable = mode === "create" || mode === "edit" || mode === "copy";

  // ─── Form State ───
  const [senderName, setSenderName] = useState(initialData?.senderName ?? DEFAULT_SENDER);
  const [targets, setTargets] = useState<string[]>(initialData?.targets ?? []);
  const [optOut, setOptOut] = useState(initialData?.optOut ?? false);
  const [subject, setSubject] = useState(initialData?.subject ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [files, setFiles] = useState<File[]>([]);

  // Design Ref: §3.2 — useMutation
  const submitMutation = useMutation({
    mutationFn: (fd: FormData) =>
      api.post<MassMailCreateResponse>("/admin/mass-mails", fd, FORM_DATA_CONFIG),
    onSuccess: (res) => {
      const { id, message } = res.data.data;
      openAlert({ type: "alert", message });
      router.push(`/admin/bulk-mail/${id}`, { transitionTypes: ["fade"] });
    },
    onError: () => {
      openAlert({ type: "alert", message: "メールの登録に失敗しました。" });
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

  // Plan SC: キャンセル → 입력값 초기화
  const handleCancel = () => {
    setSenderName(initialData?.senderName ?? DEFAULT_SENDER);
    setTargets(initialData?.targets ?? []);
    setOptOut(initialData?.optOut ?? false);
    setSubject(initialData?.subject ?? "");
    setBody(initialData?.body ?? "");
    setFiles([]);
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

  // Plan SC: 下書き保存 → status: draft → 상세로 이동
  const handleDraft = () => {
    const fd = buildFormData({
      senderName, targets, optOut, subject, body,
      status: "draft", files,
    });
    submitMutation.mutate(fd);
  };

  // Plan SC: コピーして作成 → sessionStorage에 저장 → 등록 화면 이동
  const handleCopy = () => {
    const copyData = {
      senderName,
      targets,
      optOut,
      subject,
      body,
    };
    sessionStorage.setItem("mass-mail-copy", JSON.stringify(copyData));
    router.push("/admin/bulk-mail/create", { transitionTypes: ["fade"] });
  };

  const isPending = submitMutation.isPending;
  const showSentAt = mode === "detail" || mode === "edit";

  const cardClass = "bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]";

  return (
    <div className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      {/* 관리 정보 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormInfo
          senderName={senderName}
          authorName={initialData?.createdBy ?? ""}
          authorId={initialData?.createdBy ?? ""}
          sentAt={showSentAt && initialData?.createdAt ? formatDate(initialData.createdAt) : ""}
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

      {/* 하단 버튼 (Design Ref: §7.1 모드별 분기) */}
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
        ) : isEditable ? (
          <>
            <Button variant="secondary" onClick={handleList}>
              一覧
            </Button>
            <Button variant="secondary" onClick={handleCancel}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSend} disabled={isPending}>
              配信
            </Button>
            <Button variant="outline" onClick={handleDraft} disabled={isPending}>
              下書き保存
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** ISO 날짜 → YYYY.MM.DD HH:mm 포맷 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}
