"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { BulkMailFormInfo } from "./bulk-mail-form-info";
import { BulkMailFormRecipients } from "./bulk-mail-form-recipients";
import { BulkMailFormTargets } from "./bulk-mail-form-targets";
import { BulkMailFormTitle, BulkMailFormBody } from "./bulk-mail-form-content";
import { BulkMailFormAttachment } from "./bulk-mail-form-attachment";
import type { BulkMailFormData, RecipientItem, AttachmentFile } from "./bulk-mail-form-dummy-data";

interface BulkMailFormProps {
  mode: "create" | "detail";
  initialData: BulkMailFormData;
}

export function BulkMailForm({ mode, initialData }: BulkMailFormProps) {
  const router = useRouter();
  const { openAlert } = useAlertStore();
  const isDetail = mode === "detail";

  const [ccRecipients, setCcRecipients] = useState<RecipientItem[]>(initialData.ccRecipients);
  const [bccRecipients, setBccRecipients] = useState<RecipientItem[]>(initialData.bccRecipients);
  const [targets, setTargets] = useState<string[]>(initialData.targets);
  const [title, setTitle] = useState(initialData.title);
  const [content, setContent] = useState(initialData.content);
  const [attachments, setAttachments] = useState<AttachmentFile[]>(initialData.attachments);

  const handleList = () => {
    router.push("/admin/bulk-mail", { transitionTypes: ["fade"] });
  };

  const handleCancel = () => {
    handleList();
  };

  const handleSend = () => {
    openAlert({
      type: "confirm",
      message: "メールを配信しますか？",
      confirmLabel: "配信",
      cancelLabel: "キャンセル",
    });
  };

  const handleDraft = () => {
    openAlert({
      type: "alert",
      message: "下書きを保存しました。",
      confirmLabel: "確認",
    });
  };

  const handleCopy = () => {
    // detail → create로 이동하면서 내용 복사 (파일첨부 제외)
    // 실제로는 query param이나 store로 전달하겠지만, 퍼블리싱에서는 단순 이동
    router.push("/admin/bulk-mail/create", { transitionTypes: ["fade"] });
  };

  const cardClass = "bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]";

  return (
    <div className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      {/* 관리 정보 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormInfo
          senderName={initialData.senderName}
          authorName={initialData.authorName}
          authorId={initialData.authorId}
          sentAt={initialData.sentAt}
        />
      </section>

      {/* CC/BCC 수신자 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormRecipients
          ccRecipients={ccRecipients}
          bccRecipients={bccRecipients}
          onCcChange={setCcRecipients}
          onBccChange={setBccRecipients}
          disabled={isDetail}
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

      {/* 제목 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormTitle
          title={title}
          onTitleChange={setTitle}
          disabled={isDetail}
        />
      </section>

      {/* 내용 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormBody
          content={content}
          onContentChange={setContent}
          disabled={isDetail}
        />
      </section>

      {/* 파일첨부 카드 */}
      <section className={`${cardClass} flex flex-col gap-4`}>
        <BulkMailFormAttachment
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          disabled={isDetail}
        />
      </section>

      {/* 하단 버튼 */}
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
            <Button variant="secondary" onClick={handleCancel}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSend}>
              配信
            </Button>
            <Button variant="outline" onClick={handleDraft}>
              下書き保存
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
