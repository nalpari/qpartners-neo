"use client";

import { useState } from "react";
import Image from "next/image";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { getFileIconByMime } from "@/lib/file-icon";

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

/**
 * `Content-Disposition` 헤더에서 파일명 추출.
 * RFC 5987 `filename*=UTF-8''<percent-encoded>` 우선 (일본어/한국어 보존),
 * 미존재 시 `filename="..."` fallback.
 */
function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch (decodeError) {
      console.warn("[Contents] filename* 디코딩 실패:", decodeError);
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** 이미지 파일 썸네일 — 브라우저가 직접 로드 (API 중복 호출 방지) */
function ImageThumbnail({ contentId, fileId, fileName }: { contentId: number; fileId: number; fileName: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#96A1AB]">
        IMAGE
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/contents/${contentId}/files/${fileId}/download`}
      alt={fileName}
      className="max-w-full max-h-full object-contain"
      onError={() => setError(true)}
    />
  );
}

export function ContentsDetailAttachment({
  contentId,
  attachments,
}: ContentsDetailAttachmentProps) {
  const { openAlert } = useAlertStore();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  if (attachments.length === 0) return null;

  /** 파일 1건 다운로드 (내부용 — alert 없이 throw) */
  const downloadFile = async (fileId: number, fileName: string) => {
    const res = await api.get<Blob>(`/contents/${contentId}/files/${fileId}/download`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 단독 다운로드 (사용자 alert 포함) */
  const handleDownload = async (fileId: number, fileName: string) => {
    try {
      await downloadFile(fileId, fileName);
    } catch (err: unknown) {
      console.error("[Contents] 다운로드 실패:", err);
      openAlert({ type: "alert", message: "ファイルのダウンロードに失敗しました。" });
    }
  };

  /** 일괄 다운로드 (ZIP) — fetch + blob으로 에러 감지 */
  const handleAllDownload = async () => {
    if (isDownloadingAll) return;
    setIsDownloadingAll(true);
    try {
      const res = await api.get<Blob>(`/contents/${contentId}/files/download-all`, {
        responseType: "blob",
      });
      // blob URL 다운로드 시 a.download 가 비어 있으면 브라우저가 Content-Disposition 을
      // 무시하고 blob URL 의 마지막 segment(UUID) 를 파일명으로 사용한다.
      // 서버 응답 헤더(`{title}_{YYYYMMDD}.zip` 또는 단일 파일 원본명) 를 파싱해 명시한다.
      const dispo =
        typeof res.headers["content-disposition"] === "string"
          ? res.headers["content-disposition"]
          : null;
      const fileName = parseContentDispositionFilename(dispo) ?? "download.zip";
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("[Contents] ZIP 일괄 다운로드 실패:", err);
      openAlert({ type: "alert", message: "ファイルの一括ダウンロードに失敗しました。" });
    } finally {
      setIsDownloadingAll(false);
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
          onClick={() => { void handleAllDownload(); }}
          disabled={isDownloadingAll}
          className="flex items-center gap-2 h-[42px] px-4 border border-[#96A1AB] rounded-[4px] bg-white cursor-pointer transition-colors hover:bg-[#F5F5F5] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#506273] text-center">
            {isDownloadingAll ? "ダウンロード中..." : "All Download"}
          </span>
          <span className="inline-flex items-center justify-center w-6 bg-[#506273] rounded-[10px] font-['Noto_Sans_JP'] font-medium text-[14px] leading-normal text-white text-center">
            {attachments.length}
          </span>
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
                  src={getFileIconByMime(file.mimeType, file.fileName)}
                  alt=""
                  width={48}
                  height={48}
                />
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <button
                type="button"
                onClick={() => { void handleDownload(file.id, file.fileName); }}
                className="flex-1 text-left font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] cursor-pointer hover:underline truncate"
              >
                {file.fileName}
              </button>
              <button
                type="button"
                onClick={() => { void handleDownload(file.id, file.fileName); }}
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
              onClick={() => { void handleDownload(file.id, file.fileName); }}
              className="flex-1 text-left font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] cursor-pointer hover:underline"
            >
              {file.fileName}
            </button>
            <button
              type="button"
              onClick={() => { void handleDownload(file.id, file.fileName); }}
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
