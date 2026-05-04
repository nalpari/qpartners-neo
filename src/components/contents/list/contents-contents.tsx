"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useIsInternal } from "@/hooks/use-is-internal";
import { usePageSize } from "@/hooks/use-page-size";
import { ContentsSearch } from "./contents-search";
import { ContentsTable } from "./contents-table";

interface SearchFilters {
  keyword: string;
  categoryIds: number[];
  targetType: string;
  department: string;
  internalOnly: boolean;
}

/**
 * URL 쿼리 영속 대상 — page + filters.
 * pageSize 는 URL 에서 분리해 usePageSize 로컬 state 로 관리한다 — 회원관리/공지사항 등
 * 다른 테이블과 동일한 정책. 새로고침 시 PAGE_SIZE 공통코드 sort=1 값으로 초기화 (URL 영속 X).
 */
interface SearchParams extends SearchFilters {
  page: number;
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

/** URL 쿼리 → SearchParams 파싱 — pageSize 는 별도 (usePageSize) 관리. */
function parseSearchParams(urlParams: URLSearchParams): SearchParams {
  const categoryIdsStr = urlParams.get("categoryIds") ?? "";
  return {
    page: Number(urlParams.get("page")) || 1,
    keyword: urlParams.get("keyword") ?? "",
    categoryIds: categoryIdsStr ? categoryIdsStr.split(",").map(Number).filter((n) => !isNaN(n)) : [],
    targetType: urlParams.get("targetType") ?? "",
    department: urlParams.get("department") ?? "",
    internalOnly: urlParams.get("internalOnly") === "true",
  };
}

/** SearchParams → URL 쿼리 문자열 (빈 값 제외) — pageSize 미직렬화. */
function buildQueryString(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.page > 1) qs.set("page", String(params.page));
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

  // pageSize 는 usePageSize 로컬 state 로 관리 (URL 미영속) — 새로고침 시 PAGE_SIZE 공통코드
  // sort=1 값으로 초기화. 회원관리/공지사항 등 다른 테이블과 동일한 정책.
  const { pageSize, setPageSize, isLoading: isPageSizeLoading } = usePageSize();

  // URL 쿼리에서 검색 상태 파싱 (page/keyword/filters)
  const searchParams = parseSearchParams(urlParams);

  // URL 쿼리 업데이트 (replace로 히스토리 쌓지 않음).
  // `scroll: false` — 검색·페이지 이동·페이지 사이즈 변경 모두에서 현재 스크롤 위치 유지.
  // Next.js `router.replace` 기본값이 `scroll: true` 라 URL 변경마다 상단으로 점프하던
  // 결함을 차단 (Redmine #2163). 사용자가 필터/페이지를 조작해도 결과만 갱신되고
  // 화면 위치는 그대로 — 긴 필터 패널 아래에서 검색해도 다시 스크롤할 필요 없다.
  const updateParams = useCallback(
    (next: SearchParams) => {
      router.replace(`/contents${buildQueryString(next)}`, { scroll: false });
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

  // 컨텐츠 목록 조회 — PAGE_SIZE 공통코드 로딩 중에는 게이트하여 두 번 fetch (20 → sort=1) 회피.
  const isContentsQueryEnabled = !isPageSizeLoading;
  const { data: contentsResponse, isLoading } = useQuery({
    queryKey: ["contents", searchParams, pageSize],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        page: searchParams.page,
        pageSize,
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
    enabled: isContentsQueryEnabled,
  });

  const handleSearch = (filters: SearchFilters) => {
    updateParams({ ...searchParams, ...filters, page: 1 });
  };

  const handlePageChange = (page: number) => {
    updateParams({ ...searchParams, page });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    // 페이지 사이즈 변경 시 page 만 1 로 리셋 (URL 영속) — pageSize 자체는 URL 미영속.
    updateParams({ ...searchParams, page: 1 });
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
        // 쿼리 게이트(enabled=false) 시 isLoading=false 로 떨어지므로,
        // PAGE_SIZE 공통코드 로딩 중인 빈 시간을 로딩 상태로 표시 — 빈 화면 방지.
        isLoading={isLoading || !isContentsQueryEnabled}
        pageSize={pageSize}
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
  /** 사내 사용자에게만 내려옴 — 목록 최종확인자 컬럼용 */
  approverLevel?: number | null;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 서버 단일 출처 — updatedAt !== createdAt (최초 등록 이후 1회 이상 갱신 여부) */
  hasBeenUpdated: boolean;
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
