"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import api from "@/lib/axios";
import { Spinner } from "@/components/common";

// Design Ref: §4.6 — 첨부파일 다운로드 + 이미지 미리보기

interface AttachmentItem {
  id: number;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  sortOrder: number;
}

interface ContentsDetailAttachmentProps {
  contentId: number;
  attachments: AttachmentItem[];
}

function isImageFile(mimeType: string | null): boolean {
  return mimeType != null && mimeType.startsWith("image/");
}

function isPdfFile(mimeType: string | null): boolean {
  return mimeType === "application/pdf";
}

function getFileIconSrc(mimeType: string | null): string {
  if (isPdfFile(mimeType)) return "/asset/images/contents/pdfIcon.svg";
  return "/asset/images/contents/zip_icon.svg";
}

/** 이미지 파일을 Blob URL로 로드하여 미리보기 표시 */
function ImageThumbnail({ contentId, fileId, fileName }: { contentId: number; fileId: number; fileName: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/contents/${contentId}/files/${fileId}/download`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data as Blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
        setStatus("loaded");
      })
      .catch((error: unknown) => {
        console.error("[Contents] 이미지 썸네일 로드 실패:", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [contentId, fileId]);

  if (status === "loading") return <Spinner size={24} />;

  if (status === "error" || !blobUrl) {
    return (
      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#96A1AB]">
        IMAGE
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobUrl} alt={fileName} className="max-w-full max-h-full object-contain" />;
}

export function ContentsDetailAttachment({
  contentId,
  attachments,
}: ContentsDetailAttachmentProps) {
  const [downloadingAll, setDownloadingAll] = useState(false);

  if (attachments.length === 0) return null;

  const handleDownload = async (fileId: number, fileName: string) => {
    try {
      const res = await api.get(`/contents/${contentId}/files/${fileId}/download`, {
        responseType: "blob",
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Contents] 다운로드 실패:", err);
    }
  };

  const handleAllDownload = async () => {
    setDownloadingAll(true);
    try {
      for (const file of attachments) {
        await handleDownload(file.id, file.fileName);
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="bg-white rounded-none lg:rounded-[12px] shadow-none lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 lg:gap-6 pt-[34px] pb-6 px-6 w-full lg:w-[1440px]">
      {/* 헤더: 타이틀 + All Download */}
      <div className="flex items-center gap-[10px]">
        <h2 className="flex-1 font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
          添付ファイル
        </h2>
        <button
          type="button"
          onClick={handleAllDownload}
          disabled={downloadingAll}
          className="flex items-center gap-2 h-[42px] px-4 border border-[#96A1AB] rounded-[4px] bg-white cursor-pointer transition-colors hover:bg-[#F5F5F5] disabled:opacity-50"
        >
          {downloadingAll ? (
            <Spinner size={16} />
          ) : (
            <>
              <span className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#506273] text-center">
                All Download
              </span>
              <span className="inline-flex items-center justify-center w-6 bg-[#506273] rounded-[10px] font-['Noto_Sans_JP'] font-medium text-[14px] leading-normal text-white text-center">
                {attachments.length}
              </span>
            </>
          )}
        </button>
      </div>

      {/* PC: 썸네일 그리드 */}
      <div className="hidden lg:flex gap-[22px] flex-wrap">
        {attachments.map((file) => (
          <div key={file.id} className="flex flex-col gap-4 items-center">
            <div className="size-[180px] border border-[#EAF0F6] bg-[#FDFEFE] flex items-center justify-center overflow-hidden">
              {isImageFile(file.mimeType) ? (
                <ImageThumbnail
                  contentId={contentId}
                  fileId={file.id}
                  fileName={file.fileName}
                />
              ) : (
                <Image
                  src={getFileIconSrc(file.mimeType)}
                  alt=""
                  width={48}
                  height={48}
                />
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <button
                type="button"
                onClick={() => handleDownload(file.id, file.fileName)}
                className="flex-1 text-left font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] cursor-pointer hover:underline truncate"
              >
                {file.fileName}
              </button>
              <button
                type="button"
                onClick={() => handleDownload(file.id, file.fileName)}
                className="shrink-0 flex items-center justify-center size-8 bg-[#F7F9FB] rounded-full cursor-pointer transition-colors hover:bg-[#EAF0F6]"
              >
                <Image
                  src="/asset/images/contents/file_down_icon.svg"
                  alt="ダウンロード"
                  width={20}
                  height={20}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MO: 파일명 리스트 */}
      <div className="flex lg:hidden flex-col">
        {attachments.map((file, idx) => (
          <div
            key={file.id}
            className={`flex items-center gap-4 py-3 ${
              idx === 0 ? "border-y" : "border-b"
            } border-[#EFF4F8]`}
          >
            <button
              type="button"
              onClick={() => handleDownload(file.id, file.fileName)}
              className="flex-1 text-left font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] cursor-pointer hover:underline"
            >
              {file.fileName}
            </button>
            <button
              type="button"
              onClick={() => handleDownload(file.id, file.fileName)}
              className="shrink-0 flex items-center justify-center size-8 bg-[#F7F9FB] rounded-full cursor-pointer transition-colors hover:bg-[#EAF0F6]"
            >
              <Image
                src="/asset/images/contents/file_down_icon.svg"
                alt="ダウンロード"
                width={20}
                height={20}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
