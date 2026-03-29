"use client";

import Image from "next/image";
import type { ContentDetailItem } from "../contents-dummy-data";

interface ContentsDetailAttachmentProps {
  attachments: ContentDetailItem["attachments"];
}

function getFileIconSrc(type: string): string {
  if (type === "pdf") return "/asset/images/contents/pdfIcon.svg";
  return "/asset/images/contents/zip_icon.svg";
}

export function ContentsDetailAttachment({
  attachments,
}: ContentsDetailAttachmentProps) {
  if (attachments.length === 0) return null;

  const handleDownload = (name: string) => {
    alert(`${name} のダウンロードは準備中です。`);
  };

  const handleAllDownload = () => {
    alert("一括ダウンロードは準備中です。");
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
          className="flex items-center gap-2 h-[42px] px-4 border border-[#96A1AB] rounded-[4px] bg-white cursor-pointer transition-colors hover:bg-[#F5F5F5]"
        >
          <span className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#506273] text-center">
            All Download
          </span>
          <span className="inline-flex items-center justify-center w-6 bg-[#506273] rounded-[10px] font-['Noto_Sans_JP'] font-medium text-[14px] leading-normal text-white text-center">
            {attachments.length}
          </span>
        </button>
      </div>

      {/* PC: 썸네일 그리드 */}
      <div className="hidden lg:flex gap-[22px] flex-wrap">
        {attachments.map((file, idx) => (
          <div key={idx} className="flex flex-col gap-4 items-center">
            <div className="size-[180px] border border-[#EAF0F6] bg-[#FDFEFE] flex items-center justify-center">
              {file.type === "file" ? (
                <Image
                  src={getFileIconSrc("file")}
                  alt=""
                  width={24}
                  height={24}
                />
              ) : file.type === "pdf" ? (
                <Image
                  src="/asset/images/contents/pdfIcon.svg"
                  alt=""
                  width={24}
                  height={24}
                />
              ) : null}
            </div>
            <div className="flex items-center gap-4 w-full">
              <p className="flex-1 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010]">
                {file.name}
              </p>
              <button
                type="button"
                onClick={() => handleDownload(file.name)}
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
            key={idx}
            className={`flex items-center gap-4 py-3 ${
              idx === 0 ? "border-y" : "border-b"
            } border-[#EFF4F8]`}
          >
            <p className="flex-1 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010]">
              {file.name}
            </p>
            <button
              type="button"
              onClick={() => handleDownload(file.name)}
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
