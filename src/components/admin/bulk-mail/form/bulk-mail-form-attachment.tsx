"use client";

// Design Ref: §6 — 첨부파일 처리 (File 객체 보관 + 상세 메타데이터)

import { useState, useRef } from "react";
import Image from "next/image";
import type { MassMailAttachment } from "@/components/admin/bulk-mail/bulk-mail-types";

interface BulkMailFormAttachmentProps {
  /** 실제 File 객체 (등록/편집 모드) */
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** 서버 첨부파일 메타데이터 (상세/편집 모드) */
  serverAttachments?: MassMailAttachment[];
  disabled: boolean;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function BulkMailFormAttachment({
  files,
  onFilesChange,
  serverAttachments = [],
  disabled,
}: BulkMailFormAttachmentProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (fileList: FileList) => {
    const newFiles = Array.from(fileList);
    onFilesChange([...files, ...newFiles]);
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

  const handleRemoveFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#101010]">
        ファイル添付
      </h3>

      {/* Drag&Drop 영역 (편집 가능 모드만) */}
      {!disabled && (
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
      )}

      {/* 서버 첨부파일 목록 (상세/편집 모드) */}
      {serverAttachments.length > 0 && (
        <div className="flex flex-col gap-2">
          {serverAttachments.map((att) => (
            <div key={att.id} className="flex items-center gap-3">
              <Image
                src="/asset/images/contents/pdfIcon.svg"
                alt=""
                width={24}
                height={24}
                className="shrink-0"
              />
              <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] whitespace-nowrap">
                {att.fileName}
              </span>
              {att.fileSize !== null && (
                <span className="font-['Noto_Sans_JP'] text-[12px] text-[#999]">
                  ({formatFileSize(att.fileSize)})
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 신규 첨부파일 목록 (File 객체) */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3">
              <Image
                src="/asset/images/contents/pdfIcon.svg"
                alt=""
                width={24}
                height={24}
                className="shrink-0"
              />
              <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] whitespace-nowrap">
                {file.name}
              </span>
              <span className="font-['Noto_Sans_JP'] text-[12px] text-[#999]">
                ({formatFileSize(file.size)})
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
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
              )}
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
