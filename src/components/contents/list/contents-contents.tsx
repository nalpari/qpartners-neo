"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useIsInternal } from "@/hooks/use-is-internal";
import {
  consumeListRestore,
  LIST_RESTORE_KEYS,
  markListHistoryEntry,
  useListStateCacheInvalidator,
} from "@/hooks/use-list-state-persist";
import { usePageSize } from "@/hooks/use-page-size";
import { getFallbackRole } from "@/lib/auth-role";
import type { LoginUser } from "@/lib/schemas/auth";
import { CONTENT_SORT_FIELDS, type ContentSortField } from "@/lib/schemas/content";
import { ContentsSearch } from "./contents-search";
import { ContentsTable, TARGETS_SORT_COL_ID } from "./contents-table";

/** 키워드 결합 조건 — 서버 listContentsQuerySchema.keywordOp 와 동일 값. */
type KeywordOp = "AND" | "OR";

interface SearchFilters {
  keyword: string;
  /** 공백으로 구분된 키워드들을 묶는 방식. 기본 AND. */
  keywordOp: KeywordOp;
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

export type { CategoryNode, KeywordOp, SearchFilters };

/**
 * ag-grid 헤더 클릭 정렬 상태.
 * field(고정 필드) / categoryCode(동적 카테고리 컬럼) / targets(掲示対象) 는 상호 배타적
 * — 항상 하나만 채워진다.
 */
interface SortState {
  field: ContentSortField | undefined;
  categoryCode: string | undefined;
  targets: boolean;
  dir: "asc" | "desc" | undefined;
}

const EMPTY_SORT: SortState = {
  field: undefined,
  categoryCode: undefined,
  targets: false,
  dir: undefined,
};

/** sessionStorage 의 직렬화된 정렬 상태를 안전하게 역직렬화. 손상/스키마변동 시 정렬 없음. */
function parseStoredSort(raw: string | null): SortState {
  if (!raw) return EMPTY_SORT;
  try {
    const parsed = JSON.parse(raw) as Partial<SortState> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_SORT;
    const dir = parsed.dir === "asc" || parsed.dir === "desc" ? parsed.dir : undefined;
    // 방향이 없으면 정렬 자체가 없는 것 — 나머지 값은 볼 필요 없다.
    if (!dir) return EMPTY_SORT;
    if (parsed.targets === true) return { ...EMPTY_SORT, targets: true, dir };
    if (
      typeof parsed.field === "string" &&
      (CONTENT_SORT_FIELDS as readonly string[]).includes(parsed.field)
    ) {
      return { ...EMPTY_SORT, field: parsed.field as ContentSortField, dir };
    }
    if (typeof parsed.categoryCode === "string" && parsed.categoryCode !== "") {
      return { ...EMPTY_SORT, categoryCode: parsed.categoryCode, dir };
    }
    return EMPTY_SORT;
  } catch (error: unknown) {
    console.warn("[ContentsContents] 정렬 상태 JSON 파싱 실패:", error);
    return EMPTY_SORT;
  }
}

/** 복원된 정렬 상태를 ag-grid 헤더에 표시하기 위한 colId 로 변환. 정렬 없으면 null. */
function toSortColId(sort: SortState): { colId: string; dir: "asc" | "desc" } | null {
  if (!sort.dir) return null;
  if (sort.targets) return { colId: TARGETS_SORT_COL_ID, dir: sort.dir };
  if (sort.field) return { colId: sort.field, dir: sort.dir };
  if (sort.categoryCode) return { colId: sort.categoryCode, dir: sort.dir };
  return null;
}

const EMPTY_SEARCH_PARAMS: SearchParams = {
  page: 1,
  keyword: "",
  keywordOp: "AND",
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
      // 알 수 없는 값은 기본값 AND 로 수렴 — 서버 zod enum 거부 사전 차단.
      keywordOp: parsed.keywordOp === "OR" ? "OR" : "AND",
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
  // keywordOp 은 판정에서 제외 — 키워드가 없으면 결합 조건은 결과에 영향을 주지 않는다.
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
  // 마운트 시 1회 — 복원 여부 판정 (둘 중 하나라도 참이면 복원).
  //   (1) sessionStorage 플래그: 상세/생성/편집 화면의 "一覧" 버튼 등 명시적 목록 복귀
  //   (2) popstate 로 도착한 이 entry 의 마커: 브라우저 뒤로/앞으로 복귀 (Redmine #2490)
  //       — 이 경우 해당 entry 의 스냅샷이 sessionStorage 로 먼저 복구되므로 아래 복원 경로는 동일하다.
  //   - 그 외 진입(메뉴 클릭, 새로고침, 다른 페이지 경유): false (sessionStorage 삭제, 초기화)
  const [shouldRestoreList] = useState(() => consumeListRestore("contents"));
  // 컴포넌트 unmount 시 cache 무효화 — stale 복원 회귀 차단.
  useListStateCacheInvalidator("contents");

  // pageSize — URL 미영속. shouldRestore 일 때만 sessionStorage 복원, 그 외 sort=1 초기화.
  const { pageSize, setPageSize, isLoading: isPageSizeLoading } = usePageSize({
    storageKey: LIST_RESTORE_KEYS.contents.pageSize,
    shouldRestore: shouldRestoreList,
  });

  // ag-grid 헤더 클릭 정렬 — 검색조건(searchParams)과 동일한 복원 정책을 따른다.
  //   - 상세 복귀/뒤로가기(shouldRestoreList): 직전 정렬 그대로 복원 → 목록 순서까지 동일하게 유지
  //   - 그 외 진입(메뉴 클릭, 새로고침): sessionStorage 삭제 후 서버 기본 정렬(newest)로 초기화
  const [sortResetKey, setSortResetKey] = useState(0);
  const [sort, setSort] = useState<SortState>(() => {
    if (typeof window === "undefined") return EMPTY_SORT;
    const SORT_KEY = LIST_RESTORE_KEYS.contents.sort;
    if (shouldRestoreList) {
      return parseStoredSort(window.sessionStorage.getItem(SORT_KEY));
    }
    window.sessionStorage.removeItem(SORT_KEY);
    return EMPTY_SORT;
  });
  // 마운트 시점의 정렬만 그리드 헤더에 1회 반영 — 이후 헤더 클릭은 ag-grid 자체 상태로 관리된다.
  const [initialGridSort] = useState(() => toSortColId(sort));

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

  // 정렬 변경 시 sessionStorage 동기화 — 정렬이 해제되면 삭제.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SORT_KEY = LIST_RESTORE_KEYS.contents.sort;
    if (sort.dir) {
      window.sessionStorage.setItem(SORT_KEY, JSON.stringify(sort));
    } else {
      window.sessionStorage.removeItem(SORT_KEY);
    }
  }, [sort]);

  // 브라우저 뒤로/앞으로 복원용 마커 + 이 entry 의 상태 스냅샷을 history entry 에 기록 (Redmine #2490).
  //   - 상세 화면 진입은 router.push = 새 history entry 이므로 마커가 없고, 뒤로가기는
  //     마커가 남아있는 목록 entry 로 복귀 → popstate 시점에 스냅샷을 떠서 구분한다.
  //   - deps 를 두지 않고 매 커밋마다 호출 — 위 URL 정리 replaceState 처럼 state 를 통째로
  //     덮어쓰는 호출로 마커가 지워져도 곧바로 다시 심는다. 스냅샷이 같으면 내부에서 no-op.
  //   - **반드시 위 sessionStorage 동기화 effect 들보다 뒤에 선언** — 같은 커밋에서 먼저 돌면
  //     한 커밋 이전의 검색조건이 스냅샷에 담긴다.
  useEffect(() => {
    markListHistoryEntry("contents");
  });

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

  // 公開日 칸에서 "본인 계층의 게시대상" 을 고르기 위한 권한코드.
  // 서버(route.ts 비사내 분기 / rbac-guard)와 동일 규칙 — authRole 미탑재 구 JWT 는 userTp 폴백,
  // 비로그인·해석 불가는 null(=비회원 게시대상)로 떨어진다. auth-role.ts 는 prisma 비의존이라
  // 클라이언트 번들에 안전하게 포함된다.
  const viewerRoleCode = user ? (user.authRole ?? getFallbackRole(user.userTp)) : null;

  // 카테고리 트리 조회 — 실패 시 data=[] 로 떨어져 카테고리 컬럼/필터가 조용히 사라지므로
  // isError 를 노출해 사용자가 원인을 알 수 있게 한다.
  const { data: categories = [], isError: isCategoriesError } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
        return res.data.data;
      } catch (err: unknown) {
        console.error("[ContentsContents] 카테고리 조회 실패:", err);
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // 컨텐츠 목록 조회 — PAGE_SIZE 공통코드 로딩 중에는 게이트하여 두 번 fetch (20 → sort=1) 회피.
  const isContentsQueryEnabled = !isPageSizeLoading;
  const { data: contentsResponse, isLoading, isError: isContentsError } = useQuery({
    queryKey: ["contents", searchParams, pageSize, userScope, sort],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        page: searchParams.page,
        pageSize,
      };
      // keywordOp 은 키워드가 있을 때만 전송 — 서버 기본값(AND)과 동일하면 생략해 URL/쿼리키를 단순화.
      if (searchParams.keyword) {
        params.keyword = searchParams.keyword;
        if (searchParams.keywordOp === "OR") params.keywordOp = "OR";
      }
      if (searchParams.categoryIds.length > 0) params.categoryIds = searchParams.categoryIds.join(",");
      if (searchParams.roleCode) params.roleCode = searchParams.roleCode;
      if (searchParams.departments.length > 0) params.department = searchParams.departments.join(",");
      if (searchParams.internalOnly) params.internalOnly = true;
      if (sort.field) params.sortField = sort.field;
      if (sort.categoryCode) params.sortCategoryCode = sort.categoryCode;
      if (sort.targets) params.sortTargets = true;
      if (sort.dir) params.sortDir = sort.dir;

      try {
        const res = await api.get<{
          data: ContentListItem[];
          meta: { total: number; page: number; pageSize: number; totalPages: number };
        }>("/contents", { params });
        return res.data;
      } catch (err: unknown) {
        console.error("[ContentsContents] 컨텐츠 목록 조회 실패:", err);
        throw err;
      }
    },
    enabled: isContentsQueryEnabled,
  });

  const handleSearch = (filters: SearchFilters) => {
    setSort(EMPTY_SORT);
    setSortResetKey((k) => k + 1);
    setSearchParams({ ...filters, page: 1 });
  };

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setSort(EMPTY_SORT);
    setSortResetKey((k) => k + 1);
    // 페이지 사이즈 변경 시 page 만 1 로 리셋.
    setSearchParams((prev) => ({ ...prev, page: 1 }));
  };

  // colId 우선순위: TARGETS_SORT_COL_ID(掲示対象) → 고정 7개 필드(field) → 그 외(동적 카테고리 categoryCode).
  // 카테고리 컬럼의 colId 는 항상 categories 응답의 categoryCode 값이므로, 화이트리스트에
  // 없는 colId(예: ag-grid 버전업으로 내부 colId 체계가 바뀐 경우)는 그대로 sortCategoryCode
  // 로 흘려보내지 않고 경고 로그만 남기고 정렬을 무시한다.
  const handleSortChange = (colId: string | undefined, dir: "asc" | "desc" | undefined) => {
    if (!colId) {
      setSort(EMPTY_SORT);
    } else if (colId === TARGETS_SORT_COL_ID) {
      setSort({ ...EMPTY_SORT, targets: true, dir });
    } else if ((CONTENT_SORT_FIELDS as readonly string[]).includes(colId)) {
      setSort({ ...EMPTY_SORT, field: colId as ContentSortField, dir });
    } else if (categories.some((c) => c.categoryCode === colId)) {
      setSort({ ...EMPTY_SORT, categoryCode: colId, dir });
    } else {
      console.warn("[ContentsContents] 알 수 없는 정렬 colId — 무시:", colId);
      setSort(EMPTY_SORT);
    }
    // 정렬 기준이 바뀌면 이전 페이지 번호가 무의미해지므로 1페이지로 리셋.
    setSearchParams((prev) => ({ ...prev, page: 1 }));
  };

  return (
    <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full pb-[10px] lg:pb-[48px]">
      {isCategoriesError && (
        <p className="w-[1440px] max-w-full px-6 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
          カテゴリの読み込みに失敗しました。カテゴリ列・フィルターが表示されない場合があります。
        </p>
      )}
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
        viewerRoleCode={viewerRoleCode}
        categories={categories}
        data={contentsResponse?.data ?? []}
        meta={contentsResponse?.meta}
        // 쿼리 게이트(enabled=false) 시 isLoading=false 로 떨어지므로,
        // PAGE_SIZE 공통코드 로딩 중인 빈 시간을 로딩 상태로 표시 — 빈 화면 방지.
        isLoading={isLoading || !isContentsQueryEnabled}
        isError={isContentsError}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        sortResetKey={sortResetKey}
        initialSort={initialGridSort}
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
