"use client";

import { useState, useRef } from "react";
import Image from "next/image";

export interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

interface ContentsFormAttachmentProps {
  attachments: AttachmentFile[];
  onAttachmentsChange: (files: AttachmentFile[]) => void;
}

function getFileIconSrc(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "/asset/images/contents/pdfIcon.svg";
  if (["zip", "rar", "7z"].includes(ext))
    return "/asset/images/contents/zip_icon.svg";
  return "/asset/images/contents/pdfIcon.svg";
}

export function ContentsFormAttachment({
  attachments,
  onAttachmentsChange,
}: ContentsFormAttachmentProps) {
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

  const handleRemove = (id: string) => {
    onAttachmentsChange(attachments.filter((f) => f.id !== id));
  };

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

        {/* 첨부파일 목록 */}
        {attachments.length > 0 && (
          <div className="flex flex-col gap-2">
            {attachments.map((file) => (
              <div key={file.id} className="flex items-center gap-3">
                <div className="flex items-center gap-[10px]">
                  <Image
                    src={getFileIconSrc(file.name)}
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
                  onClick={() => handleRemove(file.id)}
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
