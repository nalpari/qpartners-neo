"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useIsInternal } from "@/hooks/use-is-internal";
import {
  consumeListRestoreFlag,
  LIST_RESTORE_KEYS,
  useListStateCacheInvalidator,
} from "@/hooks/use-list-state-persist";
import { usePageSize } from "@/hooks/use-page-size";
import type { LoginUser } from "@/lib/schemas/auth";
import { ContentsSearch } from "./contents-search";
import { ContentsTable } from "./contents-table";

interface SearchFilters {
  keyword: string;
  categoryIds: number[];
  /** 게시대상 권한코드 — `__NON_MEMBER__` sentinel = 비회원 검색 (서버에서 null 로 변환) */
  roleCode: string;
  /** 담당부문 복수선택. 빈 배열 = 전체조회. */
  departments: string[];
  internalOnly: boolean;
}

/**
 * sessionStorage 영속 대상 — filters + page.
 * pageSize 는 별도 (usePageSize) 가 관리한다.
 *
 * 정책 (대량메일과 동일):
 *   - URL 쿼리에는 영속하지 않는다 — 새로고침/메뉴 재진입 시 자연 초기화.
 *   - 상세/생성/편집 → 목록 복귀 시 sessionStorage 의 setListRestoreFlag("contents")
 *     가 활성화된 경우에만 직전 검색조건/페이지 복원.
 *   - 그 외(메뉴 클릭, 새로고침, 다른 페이지 경유) 진입은 모두 초기화.
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
  /** 관리자가 토글 — false 면 콘텐츠 목록 ag-grid 의 카테고리 컬럼에서 제외된다. */
  isVisible: boolean;
  sortOrder: number;
  children: CategoryNode[];
}

export type { CategoryNode, SearchFilters };

const EMPTY_SEARCH_PARAMS: SearchParams = {
  page: 1,
  keyword: "",
  categoryIds: [],
  roleCode: "",
  departments: [],
  internalOnly: false,
};

/** sessionStorage 의 직렬화된 검색조건을 안전하게 역직렬화. 손상/스키마변동 시 빈 값. */
function parseStoredSearchParams(raw: string | null): SearchParams {
  if (!raw) return EMPTY_SEARCH_PARAMS;
  try {
    const parsed = JSON.parse(raw) as Partial<SearchParams> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_SEARCH_PARAMS;
    return {
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1,
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : "",
      categoryIds: Array.isArray(parsed.categoryIds)
        // DB id 는 양의 정수만 유효 — NaN/±Infinity/음수/0/소수는 모두 제외 (서버 zod 거부 사전 차단).
        ? parsed.categoryIds.filter((n): n is number => Number.isInteger(n) && n > 0)
        : [],
      roleCode: typeof parsed.roleCode === "string" ? parsed.roleCode : "",
      departments: Array.isArray(parsed.departments)
        ? parsed.departments.filter((d): d is string => typeof d === "string")
        : [],
      internalOnly: parsed.internalOnly === true,
    };
  } catch (error: unknown) {
    console.warn("[ContentsContents] sessionStorage JSON 파싱 실패:", error);
    return EMPTY_SEARCH_PARAMS;
  }
}

/** searchParams 가 사실상 비어있는지 (모든 검색 필드가 기본값) 판정 — page 는 제외. */
function isEmptySearchParams(params: SearchParams): boolean {
  return (
    params.keyword === "" &&
    params.categoryIds.length === 0 &&
    params.roleCode === "" &&
    params.departments.length === 0 &&
    !params.internalOnly &&
    params.page === 1
  );
}

interface ContentsContentsProps {
  /** 홈 검색바 외부 진입 시 서버(page.tsx)가 searchParams 로 확정해 전달하는 keyword.
   *  page.tsx 가 key={initialKeyword} 로 리마운트를 제어하므로, keyword 변경 시
   *  본 컴포넌트가 재마운트되어 아래 useState 초기화가 재실행된다. */
  initialKeyword?: string;
}

export function ContentsContents({ initialKeyword = "" }: ContentsContentsProps) {
  // 마운트 시 1회 — sessionStorage 복원 플래그 소비.
  //   - 상세/생성/편집 → 목록 복귀: 플래그 "1" → true (직전 검색조건/페이지/페이지 표시 개수 복원)
  //   - 그 외 진입(메뉴 클릭, 새로고침, 다른 페이지 경유): false (sessionStorage 삭제, 초기화)
  const [shouldRestoreList] = useState(() => consumeListRestoreFlag("contents"));
  // 컴포넌트 unmount 시 cache 무효화 — stale 복원 회귀 차단.
  useListStateCacheInvalidator("contents");

  // pageSize — URL 미영속. shouldRestore 일 때만 sessionStorage 복원, 그 외 sort=1 초기화.
  const { pageSize, setPageSize, isLoading: isPageSizeLoading } = usePageSize({
    storageKey: LIST_RESTORE_KEYS.contents.pageSize,
    shouldRestore: shouldRestoreList,
  });

  // searchParams 초기값:
  //   - shouldRestoreList === true → sessionStorage 의 직렬화된 값 복원
  //   - false 이고 initialKeyword 가 있으면 → 외부 진입 (홈 검색바 useHomeSearch
  //     `router.push("/contents?keyword=...")`) 으로 간주, 서버가 전달한 keyword 흡수.
  //   - false + initialKeyword 빈 → sessionStorage 즉시 삭제 + 기본 빈값.
  // keyword 는 window.location.search 대신 서버 prop(initialKeyword) 을 신뢰 — client
  // navigation 진입 타이밍 race 및 라우터 캐시 재마운트 누락을 page.tsx 의 key 제어로 차단.
  // useState lazy init 안에서 sessionStorage 부수효과 수행 (마운트 1회).
  const [searchParams, setSearchParams] = useState<SearchParams>(() => {
    if (typeof window === "undefined") {
      return initialKeyword ? { ...EMPTY_SEARCH_PARAMS, keyword: initialKeyword } : EMPTY_SEARCH_PARAMS;
    }
    const FILTERS_KEY = LIST_RESTORE_KEYS.contents.filters;
    if (shouldRestoreList) {
      return parseStoredSearchParams(window.sessionStorage.getItem(FILTERS_KEY));
    }
    window.sessionStorage.removeItem(FILTERS_KEY);
    if (initialKeyword) {
      return { ...EMPTY_SEARCH_PARAMS, keyword: initialKeyword };
    }
    return EMPTY_SEARCH_PARAMS;
  });

  // 외부 진입으로 URL 에 ?keyword=... 가 남아있는 경우 → URL 정리.
  //   - 사용자가 화면 내에서 추가 검색조건을 입력해도 URL 은 영속하지 않으므로
  //     새로고침 시 URL 의 stale keyword 가 다시 흡수되어 추가 조건이 사라지는 혼란 방지.
  //   - history.replaceState 로 직접 URL 만 갱신 (Next.js useRouter 사용 시 라우터 트리
  //     리렌더 유발 — 본 화면은 useSearchParams 미사용이라 직접 갱신이 더 가볍다).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // searchParams 변경 시 sessionStorage 동기화.
  //   - 비어있으면 삭제 — 초기화 버튼 후 이전 검색조건이 부활하는 회귀 방지.
  //   - page 까지 함께 직렬화하여 복귀 시 페이지 번호도 복원.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const FILTERS_KEY = LIST_RESTORE_KEYS.contents.filters;
    if (isEmptySearchParams(searchParams)) {
      window.sessionStorage.removeItem(FILTERS_KEY);
    } else {
      window.sessionStorage.setItem(FILTERS_KEY, JSON.stringify(searchParams));
    }
  }, [searchParams]);

  // hydration-safe: SSR/초기 hydration 은 false → Gnb 의 auth flag 전파 후 재평가
  const isInternal = useIsInternal();

  // 로그인 사용자 — TanStack Query 캐시 구독 (layout Gnb 가 /auth/login-user-info 로 주입).
  // queryKey 시드용으로만 사용 — 권한 변동 시 캐시가 분리되어 stale 응답 재사용 차단.
  // home-contents.tsx 와 동일 패턴: userTp + authRole 만 결합 (userId 는 이메일 PII 라
  // 의도적으로 제외 — TanStack Query DevTools 등에서 queryKey 평문 노출 위험 회피).
  // 동일 권한의 다른 계정 전환은 role 단위 응답이 동일하므로 캐시 공유해도 무해.
  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });
  const userScope = user ? `${user.userTp}:${user.authRole ?? "-"}` : "anon";

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
    queryKey: ["contents", searchParams, pageSize, userScope],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        page: searchParams.page,
        pageSize,
      };
      if (searchParams.keyword) params.keyword = searchParams.keyword;
      if (searchParams.categoryIds.length > 0) params.categoryIds = searchParams.categoryIds.join(",");
      if (searchParams.roleCode) params.roleCode = searchParams.roleCode;
      if (searchParams.departments.length > 0) params.department = searchParams.departments.join(",");
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
    setSearchParams({ ...filters, page: 1 });
  };

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    // 페이지 사이즈 변경 시 page 만 1 로 리셋.
    setSearchParams((prev) => ({ ...prev, page: 1 }));
  };

  return (
    <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full pb-[10px] lg:pb-[48px]">
      <ContentsSearch
        // 복원 시 폼 state 가 초기값으로 동기화되도록 key 로 리마운트 제어
        // (react-hooks/set-state-in-effect 정책 — 부모에서 key prop 으로 리마운트 권장 패턴).
        // 한 번만 평가되는 shouldRestoreList 를 그대로 사용 — 검색 동작 중 리마운트 X.
        key={`mount-${shouldRestoreList ? "restore" : "fresh"}`}
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
  /** 게시대상 권한코드 (null = 비회원). 라벨/정렬은 useTargetLabels 훅으로 변환. */
  targets: { roleCode: string | null; startAt: string | null; endAt: string | null }[];
  attachmentCount: number;
}
