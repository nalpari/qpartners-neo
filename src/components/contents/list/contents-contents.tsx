"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useIsInternal } from "@/hooks/use-is-internal";
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

/** URL 쿼리 → SearchParams 파싱 */
function parseSearchParams(urlParams: URLSearchParams): SearchParams {
  const categoryIdsStr = urlParams.get("categoryIds") ?? "";
  return {
    page: Number(urlParams.get("page")) || 1,
    pageSize: Number(urlParams.get("pageSize")) || 20,
    keyword: urlParams.get("keyword") ?? "",
    categoryIds: categoryIdsStr ? categoryIdsStr.split(",").map(Number).filter((n) => !isNaN(n)) : [],
    targetType: urlParams.get("targetType") ?? "",
    department: urlParams.get("department") ?? "",
    internalOnly: urlParams.get("internalOnly") === "true",
  };
}

/** SearchParams → URL 쿼리 문자열 (빈 값 제외) */
function buildQueryString(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.page > 1) qs.set("page", String(params.page));
  if (params.pageSize !== 20) qs.set("pageSize", String(params.pageSize));
  if (params.keyword) qs.set("keyword", params.keyword);
  if (params.categoryIds.length > 0) qs.set("categoryIds", params.categoryIds.join(","));
  if (params.targetType) qs.set("targetType", params.targetType);
  if (params.department) qs.set("department", params.department);
  if (params.internalOnly) qs.set("internalOnly", "true");
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export function ContentsContents() {
  const router = useRouter();
  const urlParams = useSearchParams();

  // URL 쿼리에서 검색 상태 파싱
  const searchParams = parseSearchParams(urlParams);

  // URL 쿼리 업데이트 (replace로 히스토리 쌓지 않음)
  const updateParams = useCallback(
    (next: SearchParams) => {
      router.replace(`/contents${buildQueryString(next)}`);
    },
    [router],
  );

  // hydration-safe: SSR/초기 hydration 은 false → Gnb 의 auth flag 전파 후 재평가
  const isInternal = useIsInternal();

  // 카테고리 트리 조회
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

      const res = await api.get<{
        data: ContentListItem[];
        meta: { total: number; page: number; pageSize: number; totalPages: number };
      }>("/contents", { params });
      return res.data;
    },
  });

  const handleSearch = (filters: SearchFilters) => {
    updateParams({ ...searchParams, ...filters, page: 1 });
  };

  const handlePageChange = (page: number) => {
    updateParams({ ...searchParams, page });
  };

  const handlePageSizeChange = (pageSize: number) => {
    updateParams({ ...searchParams, pageSize, page: 1 });
  };

  return (
    <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full pb-[10px] lg:pb-[48px]">
      <ContentsSearch
        isInternal={isInternal}
        categories={categories}
        onSearch={handleSearch}
        initialFilters={searchParams}
      />
      <ContentsTable
        isInternal={isInternal}
        categories={categories}
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
  categories: {
    id: number;
    categoryCode: string;
    name: string;
    isInternalOnly: boolean;
    children: { id: number; categoryCode: string; name: string; isInternalOnly: boolean }[];
  }[];
  targets: { targetType: string; startAt: string | null; endAt: string | null }[];
  attachmentCount: number;
}
