"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { getFileIconByName } from "@/lib/file-icon";

export interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

/** 서버에 저장된 기존 첨부파일 */
export interface SavedAttachment {
  id: number;
  fileName: string;
  fileSize: number;
}

interface ContentsFormAttachmentProps {
  attachments: AttachmentFile[];
  onAttachmentsChange: (files: AttachmentFile[]) => void;
  /** 수정 모드: 기존 저장된 파일 목록 */
  savedFiles?: SavedAttachment[];
  /** 수정 모드: 저장 파일 삭제 시 콜백 */
  onSavedFilesChange?: (files: SavedAttachment[]) => void;
  /** 수정 모드: 콘텐츠 ID (다운로드 경로용) */
  contentId?: string;
}


export function ContentsFormAttachment({
  attachments,
  onAttachmentsChange,
  savedFiles = [],
  onSavedFilesChange,
  contentId,
}: ContentsFormAttachmentProps) {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (fileList: FileList) => {
    const newFiles: AttachmentFile[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }));
    onAttachmentsChange([...attachments, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleRemoveNew = (id: string) => {
    openAlert({
      type: "confirm",
      message: "本当に削除しますか？",
      onConfirm: () => onAttachmentsChange(attachments.filter((f) => f.id !== id)),
    });
  };

  const handleRemoveSaved = (fileId: number) => {
    openAlert({
      type: "confirm",
      message: "本当に削除しますか？",
      onConfirm: async () => {
        if (!contentId) return;
        try {
          await api.delete(`/contents/${contentId}/files/${fileId}`);
          onSavedFilesChange?.(savedFiles.filter((f) => f.id !== fileId));
          queryClient.invalidateQueries({ queryKey: ["contents", contentId] });
        } catch (err: unknown) {
          console.error("[Contents] 첨부파일 삭제 실패:", err);
          openAlert({ type: "alert", message: "ファイルの削除に失敗しました。" });
        }
      },
    });
  };

  const handleDownloadSaved = async (fileId: number, fileName: string) => {
    if (!contentId) return;
    try {
      const res = await api.get<Blob>(`/contents/${contentId}/files/${fileId}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Contents] 다운로드 실패:", err);
      openAlert({ type: "alert", message: "ファイルのダウンロードに失敗しました。" });
    }
  };

  const totalCount = savedFiles.length + attachments.length;

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
      {/* 타이틀 */}
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        ファイル添付
        <span className="text-[#FF1A1A]">*</span>
      </h2>

      {/* 파일 그룹: 드롭존 + 파일목록 */}
      <div className="flex flex-col gap-[18px]">
        {/* 드래그앤드롭 영역 */}
        <div
          role="button"
          tabIndex={0}
          aria-label="ファイルを添付"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`flex flex-col items-center justify-center gap-3 py-6 border border-dashed rounded-[6px] cursor-pointer transition-colors duration-150 ${
            isDragOver
              ? "border-[#1060B4] bg-[#F0F6FC]"
              : "border-[#DCE4EC] bg-[#FDFEFE] hover:border-[#90B2CD]"
          }`}
        >
          <Image
            src="/asset/images/contents/file_add_icon.svg"
            alt=""
            width={24}
            height={24}
          />
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#90B2CD]">
            ここをクリックするか、ファイルをDrag＆Dropして添付することができます
          </p>
        </div>

        {/* 파일 목록 (저장된 파일 + 새 파일 통합) */}
        {totalCount > 0 && (
          <div className="flex flex-col gap-2">
            {/* 저장된 기존 파일 */}
            {savedFiles.map((file) => (
              <div key={`saved-${file.id}`} className="flex items-center gap-3">
                <div className="flex items-center gap-[10px]">
                  <Image
                    src={getFileIconByName(file.fileName)}
                    alt=""
                    width={24}
                    height={24}
                    className="shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => handleDownloadSaved(file.id, file.fileName)}
                    className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] whitespace-nowrap cursor-pointer hover:underline"
                  >
                    {file.fileName}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSaved(file.id)}
                  className="shrink-0 cursor-pointer transition-opacity duration-150 hover:opacity-70"
                  aria-label={`${file.fileName}を削除`}
                >
                  <Image
                    src="/asset/images/contents/file_delete.svg"
                    alt="削除"
                    width={18}
                    height={18}
                  />
                </button>
              </div>
            ))}

            {/* 새로 추가한 파일 */}
            {attachments.map((file) => (
              <div key={file.id} className="flex items-center gap-3">
                <div className="flex items-center gap-[10px]">
                  <Image
                    src={getFileIconByName(file.name)}
                    alt=""
                    width={24}
                    height={24}
                    className="shrink-0"
                  />
                  <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] whitespace-nowrap">
                    {file.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveNew(file.id)}
                  className="shrink-0 cursor-pointer transition-opacity duration-150 hover:opacity-70"
                  aria-label={`${file.name}を削除`}
                >
                  <Image
                    src="/asset/images/contents/file_delete.svg"
                    alt="削除"
                    width={18}
                    height={18}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />
    </section>
  );
}
