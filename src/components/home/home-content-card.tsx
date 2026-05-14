"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";

interface CategoryChild {
  id: number;
  name: string;
}

interface CategoryGroup {
  id: number;
  name: string;
  children: CategoryChild[];
}

export interface HomeContentItem {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** 서버 단일 출처 — updatedAt !== createdAt (최초 등록 이후 1회 이상 갱신 여부) */
  hasBeenUpdated: boolean;
  isNew: boolean;
  isUpdated: boolean;
  categories: CategoryGroup[];
  attachmentCount: number;
}

const DOWNLOAD_DELAY_MS = 300;
const MAX_DOWNLOAD_FILES = 20;

// TODO: zip 다운로드 API 완성 후 제거
async function downloadAllAttachments(contentId: number): Promise<{ success: boolean }> {
  try {
    const res = await api.get<{ data: { attachments: { id: number; fileName: string }[] } }>(`/contents/${contentId}`);
    const attachments = res.data.data.attachments;
    if (!attachments || attachments.length === 0) return { success: true };

    const files = attachments.slice(0, MAX_DOWNLOAD_FILES);
    for (const file of files) {
      const link = document.createElement("a");
      link.href = `/api/contents/${contentId}/files/${file.id}/download`;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((r) => setTimeout(r, DOWNLOAD_DELAY_MS));
    }
    return { success: true };
  } catch (err: unknown) {
    console.error("[Home] 첨부파일 다운로드 실패:", err);
    return { success: false };
  }
}

interface HomeContentCardProps {
  item: HomeContentItem;
}

export function HomeContentCard({ item }: HomeContentCardProps) {
  const createdDate = formatDate(item.createdAt);
  const updatedDate = formatDate(item.updatedAt);
  const showUpdated = item.createdAt !== item.updatedAt;
  const grouped = item.categories.filter((g) => g.children.length > 0);
  const hasAttachments = item.attachmentCount > 0;
  const downloadingRef = useRef(false);
  const queryClient = useQueryClient();

  const handleDownloadAll = () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    void downloadAllAttachments(item.id)
      .finally(() => {
        downloadingRef.current = false;
        void queryClient.invalidateQueries({ queryKey: ["home-downloads"] });
      });
  };

  return (
    <div className="flex flex-col gap-[16px] lg:gap-[20px] bg-white lg:border lg:border-[#e6eef6] lg:rounded-[12px] pt-[24px] lg:pt-[28px] px-[24px] lg:px-[28px] pb-[34px] lg:pb-[18px] overflow-hidden">
      {/* Content */}
      <div className="flex flex-col gap-[18px]">
        {/* Top info */}
        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[8px]">
            {/* Badges — 다운로드 버튼은 하단 영역으로 이동했으므로 상단은 배지만 노출 */}
            <div className="flex items-center gap-[4px]">
              {item.isNew && (
                <span className="px-[8px] py-[2px] rounded-[4px] bg-[#f4f9fd] border border-[#e3effb] font-['Pretendard'] font-medium text-[13px] text-[#63a5f2] leading-[1.5]">
                  NEW
                </span>
              )}
              {item.hasBeenUpdated && item.isUpdated && (
                <span className="px-[8px] py-[2px] rounded-[4px] bg-[#fff3f8] border border-[#f8e3eb] font-['Pretendard'] font-medium text-[13px] text-[#bc6e8d] leading-[1.5]">
                  UPDATE
                </span>
              )}
            </div>

            {/* Date */}
            <div className="flex items-center gap-[8px]">
              <span className="font-['Pretendard'] font-medium text-[13px] text-[#6a88a9] leading-[1.4]">
                {createdDate}
              </span>
              {showUpdated && (
                <div className="flex items-center gap-[4px]">
                  <Image
                    src="/asset/images/contents/reload_icon.svg"
                    alt=""
                    width={20}
                    height={20}
                    className="shrink-0"
                  />
                  <span className="font-['Pretendard'] text-[13px] text-[#6a88a9] leading-[1.4]">
                    更新 : {updatedDate}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Title — 콘텐츠 상세 진입 링크. (이전엔 하단 Read More 가 담당) */}
          <Link
            href={`/contents/${item.id}`}
            className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.5] text-[#2e5884] hover:underline"
          >
            <h3>{item.title}</h3>
          </Link>
        </div>

        {/* Category tags — PC만 표시, 부모 그룹명 + 자식 값, 선택값 있는 그룹만 */}
        {grouped.length > 0 && (
          <div className="hidden lg:flex lg:flex-row lg:flex-wrap gap-[6px] w-full">
            {grouped.map((group) => (
              <div key={group.id} className="flex items-start w-full lg:w-auto lg:shrink-0">
                <div className="flex items-center justify-center w-[79px] lg:w-auto px-[12px] py-[8px] bg-[#f4f2f0] border-l border-t border-b border-[#f4f2f0] rounded-l-[4px] shrink-0">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[11px] text-[#9c8b78] uppercase whitespace-nowrap leading-[1.3]">
                    {group.name}
                  </span>
                </div>
                <div className="flex flex-1 lg:flex-none items-center px-[12px] py-[8px] bg-white border border-[#f4f2f0] rounded-r-[4px]">
                  <span className="font-['Noto_Sans_JP'] text-[11px] text-[#505050] uppercase whitespace-nowrap leading-[1.3]">
                    {group.children.map((c) => c.name).join(", ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 첨부파일 아이콘 — 이전 Read More 영역. 첨부가 있을 때만 노출. */}
      {hasAttachments && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleDownloadAll}
            className="flex items-center justify-center size-[38px] rounded-full bg-[#f2f6fa] shrink-0 cursor-pointer hover:bg-[#e6eef6] transition-colors"
            aria-label="全ファイルダウンロード"
          >
            <Image
              src="/asset/images/contents/home_down_icon.svg"
              alt=""
              width={38}
              height={38}
            />
          </button>
        </div>
      )}
    </div>
  );
}
