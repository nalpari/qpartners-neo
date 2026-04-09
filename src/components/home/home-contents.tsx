"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Spinner } from "@/components/common";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { HomeContentCard } from "./home-content-card";
import type { HomeContentItem } from "./home-content-card";

interface ContentsResponse {
  data: HomeContentItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export function HomeContents() {
  const { data: contents = [], isLoading } = useQuery<HomeContentItem[]>({
    queryKey: ["home-contents"],
    queryFn: async () => {
      const res = await api.get<ContentsResponse>("/contents", {
        params: { pageSize: 20 },
      });
      return res.data.data.slice(0, 4);
    },
    staleTime: 60_000,
  });

  // 카테고리 트리 (부모 그룹명 매핑용)
  const { data: categoryTree = [] } = useQuery<CategoryNode[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  return (
    <>
      {/* PC Layout */}
      <div className="hidden lg:flex h-full flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] px-[42px] pb-[42px] overflow-hidden">
        <ContentsHeader />
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={48} />
          </div>
        ) : contents.length === 0 ? (
          <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center py-20">
            コンテンツがありません。
          </p>
        ) : (
          <div className="flex flex-col gap-[18px]">
            {contents.map((item) => (
              <HomeContentCard key={item.id} item={item} categoryTree={categoryTree} />
            ))}
          </div>
        )}
      </div>

      {/* MO Layout */}
      <div className="flex lg:hidden flex-col gap-[10px]">
        <div className="px-[24px] pt-[16px] pb-[8px]">
          <ContentsHeader />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-20 bg-white">
            <Spinner size={48} />
          </div>
        ) : contents.length === 0 ? (
          <div className="bg-white py-20">
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
              コンテンツがありません。
            </p>
          </div>
        ) : (
          contents.map((item) => (
            <div key={item.id} className="bg-white">
              <HomeContentCard item={item} categoryTree={categoryTree} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ContentsHeader() {
  return (
    <div className="flex items-center gap-[12px] pr-[4px]">
      <div className="flex items-center justify-center size-[40px] bg-[#d2dbe5] rounded-full shrink-0">
        <Image
          src="/asset/images/contents/home_cont_icon.svg"
          alt=""
          width={40}
          height={40}
        />
      </div>
      <h2 className="flex-1 font-['Noto_Sans_JP'] font-bold text-[16px] lg:text-[18px] text-[#2e5884] leading-[1.5]">
        最近コンテンツ
      </h2>
      <Link
        href="/contents"
        className="flex items-center justify-center gap-[8px] px-[12px] py-[7px] border border-[#e5e5e5] rounded-[4px] bg-white shrink-0 hover:bg-[#f7f9fb] transition-colors"
      >
        <span className="font-['Noto_Sans_JP'] text-[13px] text-[#101010] leading-[1.3] uppercase whitespace-nowrap">
          全て見る
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M4 0.5V7.5M0.5 4H7.5" stroke="#101010" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}
