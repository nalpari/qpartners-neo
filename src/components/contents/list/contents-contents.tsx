"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { ContentsSearch } from "./contents-search";
import { ContentsTable } from "./contents-table";

interface SearchFilters {
  keyword: string;
  categoryIds: number[];
  targetType: string;
  department: string;
  internalOnly: boolean;
}

interface SearchParams extends SearchFilters {
  page: number;
  pageSize: number;
}

interface CategoryNode {
  id: number;
  categoryCode: string;
  name: string;
  parentId: number | null;
  isInternalOnly: boolean;
  isActive: boolean;
  sortOrder: number;
  children: CategoryNode[];
}

export type { CategoryNode, SearchFilters };

export function ContentsContents() {
  // TODO: 실제 권한 체크로 교체
  const isAdmin = true;

  const [searchParams, setSearchParams] = useState<SearchParams>({
    page: 1,
    pageSize: 20,
    keyword: "",
    categoryIds: [],
    targetType: "",
    department: "",
    internalOnly: false,
  });

  // 카테고리 트리 조회 (staleTime 5분)
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 컨텐츠 목록 조회
  const { data: contentsResponse, isLoading } = useQuery({
    queryKey: ["contents", searchParams],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        page: searchParams.page,
        pageSize: searchParams.pageSize,
      };
      if (searchParams.keyword) params.keyword = searchParams.keyword;
      if (searchParams.categoryIds.length > 0) params.categoryIds = searchParams.categoryIds.join(",");
      if (searchParams.targetType) params.targetType = searchParams.targetType;
      if (searchParams.department) params.department = searchParams.department;
      if (searchParams.internalOnly) params.internalOnly = true;

      const res = await api.get("/contents", { params });
      return res.data as {
        data: ContentListItem[];
        meta: { total: number; page: number; pageSize: number; totalPages: number };
      };
    },
  });

  const handleSearch = (filters: SearchFilters) => {
    setSearchParams((prev) => ({ ...prev, ...filters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setSearchParams((prev) => ({ ...prev, pageSize, page: 1 }));
  };

  return (
    <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full pb-[10px] lg:pb-[48px]">
      <ContentsSearch
        isAdmin={isAdmin}
        categories={categories}
        onSearch={handleSearch}
      />
      <ContentsTable
        isAdmin={isAdmin}
        data={contentsResponse?.data ?? []}
        meta={contentsResponse?.meta}
        isLoading={isLoading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </main>
  );
}

// API 응답 항목 타입
export interface ContentListItem {
  id: number;
  title: string;
  status: string;
  authorDepartment: string | null;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isNew: boolean;
  isUpdated: boolean;
  categories: { id: number; name: string; categoryCode: string; isInternalOnly: boolean }[];
  targets: { targetType: string; startAt: string | null; endAt: string | null }[];
  attachmentCount: number;
}
