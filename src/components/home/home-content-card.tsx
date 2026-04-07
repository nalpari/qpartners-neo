"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";
import type { CategoryNode } from "@/components/contents/list/contents-contents";

interface CategoryItem {
  id: number;
  name: string;
  categoryCode: string;
  isInternalOnly: boolean;
}

export interface HomeContentItem {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  isNew: boolean;
  isUpdated: boolean;
  categories: CategoryItem[];
  attachmentCount: number;
}

const DOWNLOAD_DELAY_MS = 300;

async function downloadAllAttachments(contentId: number) {
  try {
    const res = await api.get<{ data: { attachments: { id: number; fileName: string }[] } }>(`/contents/${contentId}`);
    const attachments = res.data.data.attachments;
    if (!attachments || attachments.length === 0) return;

    for (const file of attachments) {
      const link = document.createElement("a");
      link.href = `/api/contents/${contentId}/files/${file.id}/download`;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((r) => setTimeout(r, DOWNLOAD_DELAY_MS));
    }
  } catch (err: unknown) {
    console.error("[Home] 첨부파일 다운로드 실패:", err);
  }
}

interface HomeContentCardProps {
  item: HomeContentItem;
  categoryTree: CategoryNode[];
}

/** 카테고리 트리에서 부모 그룹별로 매칭된 자식만 추출 (선택값 있는 그룹만) */
function groupCategoriesByParent(
  categories: CategoryItem[],
  tree: CategoryNode[],
) {
  const contentIds = new Set(categories.map((c) => c.id));
  const parents = tree.filter((c) => c.parentId === null);

  return parents
    .map((parent) => {
      const matched = parent.children.filter((child) => contentIds.has(child.id));
      if (matched.length === 0) return null;
      return { label: parent.name, values: matched.map((c) => c.name) };
    })
    .filter((g) => g != null);
}

export function HomeContentCard({ item, categoryTree }: HomeContentCardProps) {
  const createdDate = formatDate(item.createdAt);
  const updatedDate = formatDate(item.updatedAt);
  const showUpdated = item.createdAt !== item.updatedAt;
  const grouped = groupCategoriesByParent(item.categories, categoryTree);
  const hasAttachments = item.attachmentCount > 0;
  const downloadingRef = useRef(false);

  const handleDownloadAll = () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    void downloadAllAttachments(item.id)
      .finally(() => { downloadingRef.current = false; });
  };

  return (
    <div className="flex flex-col gap-[16px] lg:gap-[20px] bg-white lg:border lg:border-[#e6eef6] lg:rounded-[12px] pt-[24px] lg:pt-[28px] px-[24px] lg:px-[28px] pb-[34px] lg:pb-[18px] overflow-hidden">
      {/* Content */}
      <div className="flex flex-col gap-[18px]">
        {/* Top info */}
        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[8px]">
            {/* Badges + Download icon */}
            <div className="flex items-center">
              <div className="flex-1 flex items-center gap-[4px]">
                {item.isNew && (
                  <span className="px-[8px] py-[2px] rounded-[4px] bg-[#f4f9fd] border border-[#e3effb] font-['Pretendard'] font-medium text-[13px] text-[#63a5f2] leading-[1.5]">
                    NEW
                  </span>
                )}
                {item.isUpdated && (
                  <span className="px-[8px] py-[2px] rounded-[4px] bg-[#fff3f8] border border-[#f8e3eb] font-['Pretendard'] font-medium text-[13px] text-[#bc6e8d] leading-[1.5]">
                    UPDATE
                  </span>
                )}
              </div>
              {hasAttachments && (
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

          {/* Title */}
          <h3 className="font-['Noto_Sans_JP'] font-semibold text-[16px] leading-[1.5] text-[#2e5884]">
            {item.title}
          </h3>
        </div>

        {/* Category tags — PC만 표시, 부모 그룹명 + 자식 값, 선택값 있는 그룹만 */}
        {grouped.length > 0 && (
          <div className="hidden lg:flex lg:flex-row lg:flex-wrap gap-[6px] w-full">
            {grouped.map((group) => (
              <div key={group.label} className="flex items-start w-full lg:w-auto lg:shrink-0">
                <div className="flex items-center justify-center w-[79px] lg:w-auto px-[12px] py-[8px] bg-[#f4f2f0] border-l border-t border-b border-[#f4f2f0] rounded-l-[4px] shrink-0">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[11px] text-[#9c8b78] uppercase whitespace-nowrap leading-[1.3]">
                    {group.label}
                  </span>
                </div>
                <div className="flex flex-1 lg:flex-none items-center px-[12px] py-[8px] bg-white border border-[#f4f2f0] rounded-r-[4px]">
                  <span className="font-['Noto_Sans_JP'] text-[11px] text-[#505050] uppercase whitespace-nowrap leading-[1.3]">
                    {group.values.join(", ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Read More */}
      <div className="flex items-center">
        <Link href={`/contents/${item.id}`} className="flex items-center">
          <span className="font-['Pretendard'] font-medium text-[11px] text-[#004ea1] uppercase tracking-[1.375px] leading-[1.4]">
            Read More
          </span>
          <Image
            src="/asset/images/contents/read_more_icon.svg"
            alt=""
            width={32}
            height={32}
          />
        </Link>
      </div>
    </div>
  );
}
