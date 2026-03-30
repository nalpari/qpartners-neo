"use client";

import Image from "next/image";
import { useAlertStore } from "@/lib/store";

interface ContentsDetailInfoProps {
  viewCount: number;
  department: string;
  publisher: string;
  updater: string;
  approver: string;
}

const INFO_FIELDS = [
  { label: "担当部門", key: "department" },
  { label: "掲載担当者", key: "publisher" },
  { label: "更新担当者", key: "updater" },
  { label: "最終承認者", key: "approver" },
] as const;

export function ContentsDetailInfo({
  viewCount,
  department,
  publisher,
  updater,
  approver,
}: ContentsDetailInfoProps) {
  const values: Record<string, string> = {
    department,
    publisher,
    updater,
    approver,
  };

  const { openAlert } = useAlertStore();

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      openAlert({ type: "alert", message: "URLがコピーされました。" });
    } catch {
      openAlert({ type: "alert", message: "URLのコピーに失敗しました。" });
    }
  };

  return (
    <>
      {/* 상단 메타 */}
      <div className="pt-6 lg:pt-0 pb-2 lg:pb-0 px-6 lg:px-0 w-full lg:w-[1440px]">
        <div className="flex items-center gap-3 pl-1">
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#101010]">
            景色{" "}
            <span className="font-semibold text-[#E97923]">
              {viewCount.toLocaleString()}
            </span>
            件
          </p>
          <div className="bg-[#DDE3E8] w-px h-3" />
          <button
            type="button"
            onClick={handleCopyUrl}
            className="flex items-center gap-[6px] cursor-pointer"
          >
            <Image
              src="/asset/images/contents/copy_link_icon.svg"
              alt=""
              width={20}
              height={20}
            />
            <span className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#101010]">
              URLコピー
            </span>
          </button>
        </div>
      </div>

      {/* PC: 관리정보 4열 테이블 */}
      <div className="hidden lg:block bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] p-6 w-[1440px]">
        <div className="flex gap-1">
          {INFO_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-1 gap-1 h-[58px]">
              <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
                <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap truncate">
                  {field.label}
                </span>
              </div>
              <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
                <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                  {values[field.key]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MO: 관리정보 세로 카드 */}
      <div className="block lg:hidden bg-white px-6 py-[34px] w-full">
        <div className="flex flex-col gap-[18px]">
          {INFO_FIELDS.map((field, idx) => (
            <div
              key={field.key}
              className={`flex flex-col gap-2 ${
                idx > 0 ? "border-t border-[#EFF4F8] pt-[18px]" : ""
              }`}
            >
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F]">
                {field.label}
              </p>
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                {values[field.key]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
