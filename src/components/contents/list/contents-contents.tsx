"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useIsInternal } from "@/hooks/use-is-internal";
import {
  consumeListRestore,
  LIST_RESTORE_KEYS,
  readListStorage,
  removeListStorage,
  useListHistoryMarker,
  useListStateCacheInvalidator,
  writeListStorage,
} from "@/hooks/use-list-state-persist";
import { usePageSize } from "@/hooks/use-page-size";
import { getFallbackRole } from "@/lib/auth-role";
import type { LoginUser } from "@/lib/schemas/auth";
import { CONTENT_SORT_FIELDS, type ContentSortField } from "@/lib/schemas/content";
import { ContentsFacets, ContentsModeSwitch } from "./contents-facets";
import type { ProductAxisGroup, ProductListRow } from "./contents-facet-utils";
import { resolveVisibleAxes } from "./contents-facet-utils";
import { ContentsSearch } from "./contents-search";
import { ContentsTable, TARGETS_SORT_COL_ID } from "./contents-table";

/** 키워드 결합 조건 — 서버 listContentsQuerySchema.keywordOp 와 동일 값. */
type KeywordOp = "AND" | "OR";

/** 목록 탭 — `資料一覧` / `製品一覧` (검색 고도화 REQ-005) */
type ListView = "doc" | "prod";

/**
 * 분류축 집계 결과를 어떻게 반영할지 — REQ-004.
 *
 * - `apply` : 체크 상태를 이 값으로 덮는다 (`null` = 미설정 = 화면상 전부 체크)
 * - `keep`  : 체크를 **그대로 둔다** — 2자 이하 실시간 재조회, 집계 호출 실패
 * - `stale` : 더 새 요청이 진행 중이라 이 응답은 버린다 (키워드도 반영하지 않는다)
 */
type FacetOutcome =
  | { kind: "apply"; facetCategoryIds: number[] | null }
  | { kind: "keep" }
  | { kind: "stale" };

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
 * 분류축·형번축 선택 상태.
 *
 * 값이 셋이다:
 * - `null` = **미설정(초기 상태)**. 화면에는 **전부 체크**로 보이고, 서버에도 **전부 체크와 같은
 *   조건**(각 축의 전체 id)이 나간다 — 「전부 체크 = AND 조건 대상」 이라는 2026-10-23 사용자
 *   결정 때문이다(목업 `01-search.html:1317` 도 전 항목 `checked` 로 그린다). 조립은
 *   `facetParams` 가 한다. 전체 id 를 state 에 채우지 않는 이유는 축 데이터가 비동기로 와서
 *   `useEffect` 안 setState 가 필요해지기 때문이다(React Compiler 금지 규칙).
 * - `[]` = 사용자가 **전부 해제**했다. 전부 해제된 축만 조건에서 빠진다(§27.3).
 * - 그 외 = 체크된 id 만 조건으로 보낸다.
 *
 * 그래서 `null` 과 `[]` 는 **서버 조건이 다르다** — `null` 은 축 전체가 조건이 되고, `[]` 는 그
 * 축이 조건에서 빠진다. 둘을 하나로 합치면 「전부 해제」를 눌러도 다시 전부 체크로 보여
 * 버튼이 듣지 않는 것처럼 된다.
 *
 * ⚠️ 조건이 걸린 축은 **그 축에 분류가 하나도 없는 자료를 탈락시킨다.** 개발 DB 는 축이 5개이고
 * 전 축에 분류를 가진 published 자료가 2,459건 중 21건뿐이라, 초기 화면이 21건으로 보인다.
 * 제품일람은 형번 연결 자료가 7건(축 커버리지 최대 3개)이어서 전 축 조건 시 0건이 된다 —
 * 구현 문제가 아니라 데이터 상태다(2026-10-26 실측).
 */
interface FacetSelection {
  /** 체크된 2Depth 카테고리 id — 서버 `facetCategoryIds` 와 1:1. `null` = 미설정(전부 체크 표시) */
  facetCategoryIds: number[] | null;
  /** 체크된 형번 id (型番 축). `null` = 미설정(전부 체크 표시) */
  productModelIds: number[] | null;
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
interface SearchParams extends SearchFilters, FacetSelection {
  page: number;
  /** 선택된 탭 — 탭마다 조회 대상(자료/제품)과 적용 축이 다르다 */
  view: ListView;
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

export type { CategoryNode, KeywordOp, ListView, SearchFilters };
export type { ProductAxisGroup, ProductListRow } from "./contents-facet-utils";

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
  // 既定は「製品から探す」 — 업무리뷰 2026.10.20 확정(목업 `01-search.html:2364`).
  view: "prod",
  keyword: "",
  keywordOp: "AND",
  categoryIds: [],
  roleCode: "",
  departments: [],
  internalOnly: false,
  // null = 미설정 — 좌측영역은 전부 체크로 보이고 조건은 걸지 않는다 (2026-10-23).
  facetCategoryIds: null,
  productModelIds: null,
};

/** sessionStorage 의 직렬화된 검색조건을 안전하게 역직렬화. 손상/스키마변동 시 빈 값. */
function parseStoredSearchParams(raw: string | null): SearchParams {
  if (!raw) return EMPTY_SEARCH_PARAMS;
  try {
    const parsed = JSON.parse(raw) as Partial<SearchParams> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_SEARCH_PARAMS;
    return {
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1,
      view: parsed.view === "prod" ? "prod" : "doc",
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
      facetCategoryIds: parseIdArrayOrNull(parsed.facetCategoryIds),
      productModelIds: parseIdArrayOrNull(parsed.productModelIds),
    };
  } catch (error: unknown) {
    console.warn("[ContentsContents] sessionStorage JSON 파싱 실패:", error);
    return EMPTY_SEARCH_PARAMS;
  }
}

/** 분류축·형번축 선택 복원 — 배열이 아니면 `null`(미설정 = 전부 체크 표시)로 둔다. */
function parseIdArrayOrNull(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is number => Number.isInteger(v) && v > 0);
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
    // `null`(미설정 = 화면 최초 오픈 상태)만 「비었다」로 본다. **빈 배열은 사용자가 전부
    // 해제한 결과**이므로 조건이 걸린 상태다 — 종전에는 길이 0 으로 묶어 판정해, 전부
    // 해제한 상태가 상세를 거쳐 돌아올 때 전부 체크로 되돌아갔다(2026-10-29 사용자 결정:
    // 전체 체크는 화면 최초 오픈 시에만, 좌측영역을 건드렸다면 그 상태를 유지한다).
    params.facetCategoryIds === null &&
    params.productModelIds === null &&
    params.view === "prod" &&
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
  //   - 그 외 진입(메뉴 클릭, 새로고침, 다른 페이지 경유): false (sessionStorage 삭제, 초기화)
  // 두 경로 모두 복원 소스는 sessionStorage 전역 슬롯(scope 당 1개) 이다.
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
  // 모바일 분류축 패널 토글 — 데스크톱은 상설 사이드바, 모바일은 접이식
  // (REQ-006 모바일 전용 UI 는 차기. 현행 모바일에도 필터가 있었으므로 기능은 남긴다).
  const [isFacetOpenMobile, setIsFacetOpenMobile] = useState(false);
  const [sortResetKey, setSortResetKey] = useState(0);
  const [sort, setSort] = useState<SortState>(() => {
    if (typeof window === "undefined") return EMPTY_SORT;
    const SORT_KEY = LIST_RESTORE_KEYS.contents.sort;
    if (shouldRestoreList) {
      return parseStoredSort(readListStorage(SORT_KEY));
    }
    removeListStorage(SORT_KEY);
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
      return parseStoredSearchParams(readListStorage(FILTERS_KEY));
    }
    removeListStorage(FILTERS_KEY);
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
  //   - **기존 state 를 그대로 넘긴다** — `{}` 로 덮으면 Next 내부 키(`__NA`)가 사라져,
  //     그 entry 로 뒤로가기할 때 App Router 가 SPA 복원 대신 full reload 로 폴백한다
  //     (app-router.js: `if (!event.state.__NA) window.location.reload()`). 문서가 새로
  //     뜨면 documentId 가 재발급되어 복원 마커가 불일치하므로 #2490 자체가 무력화된다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  // searchParams 변경 시 sessionStorage 동기화.
  //   - 비어있으면 삭제 — 초기화 버튼 후 이전 검색조건이 부활하는 회귀 방지.
  //   - page 까지 함께 직렬화하여 복귀 시 페이지 번호도 복원.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const FILTERS_KEY = LIST_RESTORE_KEYS.contents.filters;
    if (isEmptySearchParams(searchParams)) {
      removeListStorage(FILTERS_KEY);
    } else {
      writeListStorage(FILTERS_KEY, JSON.stringify(searchParams));
    }
  }, [searchParams]);

  // 정렬 변경 시 sessionStorage 동기화 — 정렬이 해제되면 삭제.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SORT_KEY = LIST_RESTORE_KEYS.contents.sort;
    if (sort.dir) {
      writeListStorage(SORT_KEY, JSON.stringify(sort));
    } else {
      removeListStorage(SORT_KEY);
    }
  }, [sort]);

  // 브라우저 뒤로/앞으로 복원용 마커를 history entry 에 기록 (Redmine #2490).
  //   - 상세 화면 진입은 router.push = 새 history entry 이므로 마커가 없고, 뒤로가기는
  //     마커가 남아있는 목록 entry 로 복귀 → popstate 시점에 이를 대조해 구분한다.
  useListHistoryMarker("contents");

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
  const {
    data: categories = [],
    isError: isCategoriesError,
  } = useQuery({
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

  // 型番 축 선택지 — 제품일람 탭에서만 쓰지만, 탭 전환마다 받아오지 않도록 항상 조회해 캐시한다.
  // 검색조건과 무관하게 고정인 목록이다 (`/api/products/axis` 주석 참조).
  const { data: productAxisResponse, isError: isProductAxisError } = useQuery({
    queryKey: ["products", "axis", userScope],
    queryFn: async () => {
      const res = await api.get<{
        data: ProductAxisGroup[];
        meta: { enabled: boolean };
      }>("/products/axis");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const productAxis = productAxisResponse?.data ?? [];
  const isProductAxisEnabled = productAxisResponse?.meta.enabled ?? false;

  /**
   * 분류축 쿼리 파라미터.
   *
   * **결합 규칙 (2026-10-23 사용자 확정)**
   * - 축 **안**: OR — 체크한 선택지 중 하나라도 맞으면 통과
   * - **전부 체크 · 일부 체크**: 그 축은 **AND 조건 대상**
   * - **전부 해제**: 그 축만 AND 조건에서 **제외**. 「체크가 없으니 0건」이 아니라
   *   그 축을 조건에서 빼는 것이다 — 나머지 축의 조건만으로 조회한다.
   *
   * 판정은 서버가 한다(`lib/content-visibility.ts#resolveFacetConditions`) — 보낸 id 를
   * 축별로 묶어 축 안은 `IN`, 축 사이는 조건을 따로 걸어 AND 가 된다.
   *
   * 조건이 걸린 축은 **그 축에 분류가 없는 자료를 탈락**시킨다. 그래서 전부 체크를 조건으로
   * 쓰는 이 규칙에서는 분류가 비어 있는 자료가 보이지 않는다 — 이는 규칙의 정의대로이며,
   * 보이게 하려면 카테고리 데이터(미지정 자료)를 채워야 한다.
   *
   * `null`(초기 미설정) 은 화면상 전부 체크이므로 **전부 체크와 같게** 다룬다.
   */
  const facetParams = useMemo<Record<string, string>>(() => {
    const params: Record<string, string> = {};
    const selected = searchParams.facetCategoryIds;
    const chosen = selected === null ? null : new Set(selected);

    const conditioned: number[] = [];
    for (const axis of resolveVisibleAxes(categories, isInternal)) {
      const axisIds = axis.children
        .filter((child) => isInternal || !child.isInternalOnly)
        .map((child) => child.id);
      // null = 초기(전부 체크) — 축 전체가 조건이 된다.
      const picked = chosen === null ? axisIds : axisIds.filter((id) => chosen.has(id));
      // 전부 해제된 축만 조건에서 뺀다.
      if (picked.length > 0) conditioned.push(...picked);
    }

    if (conditioned.length > 0) params.facetCategoryIds = conditioned.join(",");
    return params;
  }, [searchParams.facetCategoryIds, categories, isInternal]);

  // 컨텐츠 목록 조회 — PAGE_SIZE 공통코드 로딩 중에는 게이트하여 두 번 fetch (20 → sort=1) 회피.
  // 탭별로 조회 대상이 달라 각각 자기 탭에서만 활성화한다 (전환 후 복귀는 캐시에서 즉시).
  const isContentsQueryEnabled =
    !isPageSizeLoading && searchParams.view === "doc";
  const { data: contentsResponse, isLoading, isError: isContentsError } = useQuery({
    queryKey: ["contents", searchParams, pageSize, userScope, sort, facetParams],
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
      // 분류축 — 축 안 OR / 축 사이 AND. 자료일람 탭에서는 型番 축을 적용하지 않는다(목업 정책).
      Object.assign(params, facetParams);
      if (searchParams.roleCode) params.roleCode = searchParams.roleCode;
      if (searchParams.departments.length > 0) params.department = searchParams.departments.join(",");
      if (searchParams.internalOnly) params.internalOnly = true;
      if (sort.field) params.sortField = sort.field;
      if (sort.categoryCode) params.sortCategoryCode = sort.categoryCode;
      if (sort.targets) params.sortTargets = true;
      if (sort.dir) params.sortDir = sort.dir;
      // 검색 고도화 기본 정렬 — 키워드가 있으면 관련도순(서버 `sort=relevance`).
      // 명시 정렬(헤더 클릭)이 걸려 있으면 서버가 그쪽 분기를 먼저 타므로 보내지 않는다.
      if (searchParams.keyword && !sort.field && !sort.categoryCode && !sort.targets) {
        params.sort = "relevance";
      }

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

  // 제품일람 — 자료 검색 결과를 형번 단위로 묶은 집계 (`/api/products`).
  const isProductsQueryEnabled =
    !isPageSizeLoading &&
    searchParams.view === "prod";
  const {
    data: productsResponse,
    isLoading: isProductsLoading,
    isError: isProductsError,
  } = useQuery({
    queryKey: ["products", "list", searchParams, pageSize, userScope, facetParams],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: searchParams.page,
        pageSize,
      };
      if (searchParams.keyword) {
        params.keyword = searchParams.keyword;
        if (searchParams.keywordOp === "OR") params.keywordOp = "OR";
      }
      Object.assign(params, facetParams);
      const selectedModelIds = searchParams.productModelIds ?? [];
      if (selectedModelIds.length > 0) {
        params.productModelIds = selectedModelIds.join(",");
      }
      try {
        const res = await api.get<{
          data: ProductListRow[];
          meta: { total: number; page: number; pageSize: number; totalPages: number };
        }>("/products", { params });
        return res.data;
      } catch (err: unknown) {
        console.error("[ContentsContents] 제품일람 조회 실패:", err);
        throw err;
      }
    },
    enabled: isProductsQueryEnabled,
  });

  /**
   * 키워드 연동 카테고리 체크 — REQ-004.
   *
   * 「검색 결과와 일치하는 카테고리는 자동 체크, 일치하지 않는 카테고리는 체크 해제」.
   * 서버가 **축 조건을 뺀** 집합에서 집계한 `availableFacets` 를 돌려주고, 그 목록으로
   * 체크 상태를 덮는다.
   *
   * ⚠️ 집계를 **먼저** 받고 키워드·체크를 한 번에 `setSearchParams` 한다. 목록 응답을 보고
   * 체크를 고치는 방식은 쓸 수 없다 — React Compiler 가 `useEffect` 안 setState 를 막는다
   * (`.claude/rules/react-components.md`). 데이터는 쓰지 않으므로 `pageSize=1` 로 받는다.
   *
   * 집계 호출이 실패하면 체크를 건드리지 않고 키워드만 바꾼다 — 검색 자체가 막히면 안 된다.
   */
  const fetchAvailableFacets = async (
    keyword: string,
    keywordOp: SearchParams["keywordOp"],
  ): Promise<number[] | null> => {
    try {
      // `facets=1` 이 집계 전용 플래그다 — 이 플래그 없는 조회는 서버가 집계를 건너뛴다.
      const params: Record<string, string | number | boolean> = {
        page: 1,
        pageSize: 1,
        facets: true,
      };
      if (keyword) {
        params.keyword = keyword;
        if (keywordOp === "OR") params.keywordOp = "OR";
      }
      if (searchParams.roleCode) params.roleCode = searchParams.roleCode;
      if (searchParams.departments.length > 0)
        params.department = searchParams.departments.join(",");
      if (searchParams.internalOnly) params.internalOnly = true;
      const res = await api.get<{ availableFacets?: { categoryIds: number[] } }>(
        "/contents",
        { params },
      );
      return res.data.availableFacets?.categoryIds ?? null;
    } catch (err: unknown) {
      console.warn("[ContentsContents] 분류축 집계 조회 실패 — 체크 상태를 유지합니다:", err);
      return null;
    }
  };

  /** 집계 결과를 체크 상태로 환산 — 표시 중인 축의 선택지 중 결과에 나타나는 것만 남긴다. */
  const toFacetSelection = (availableIds: number[]): number[] => {
    const available = new Set(availableIds);
    const selectable = resolveVisibleAxes(categories, isInternal).flatMap((axis) =>
      axis.children
        .filter((child) => isInternal || !child.isInternalOnly)
        .map((child) => child.id),
    );
    return selectable.filter((id) => available.has(id));
  };

  /**
   * 집계 요청 순번 — 늦게 도착한 옛 응답이 새 상태를 덮어쓰는 것을 막는다.
   *
   * 검색을 빠르게 두 번 하면 먼저 보낸 요청이 나중에 도착할 수 있고, 그대로 반영하면
   * 키워드와 체크가 한 번 전 상태로 되돌아간다.
   */
  const facetSeqRef = useRef(0);

  /**
   * 키워드에 맞춘 체크 상태를 만든다 — REQ-004.
   *
   * 검색어가 빈 경우의 처리가 **경로마다 다르다**:
   * - `explicit`([검색] 클릭) → 전체 선택으로 복귀. 요구사항 ③ 「검색어 삭제 후 [검색]
   *   클릭 → 검색 조건 초기화 / 모든 필터 옵션 전체 선택 / 전체 콘텐츠 표시」.
   * - `realtime`(타이핑 중 2자 이하) → 체크를 **그대로 둔다.** 이 경로는 키워드만 풀고
   *   좌측영역 선택 기준으로 다시 조회하는 것이 요구다(2026-10-29 사용자 확인). 전체
   *   선택으로 되돌리면 좁혀 둔 체크가 글자를 지우는 순간 날아간다.
   *
   * 집계 호출이 실패하면 체크를 건드리지 않는다 — 검색 자체는 진행해야 한다.
   */
  const resolveFacetPatch = async (
    keyword: string,
    keywordOp: SearchParams["keywordOp"],
    trigger: "explicit" | "realtime",
  ): Promise<FacetOutcome> => {
    const seq = facetSeqRef.current + 1;
    facetSeqRef.current = seq;
    if (!keyword.trim()) {
      return trigger === "realtime"
        ? { kind: "keep" }
        : { kind: "apply", facetCategoryIds: null };
    }
    const availableIds = await fetchAvailableFacets(keyword, keywordOp);
    if (seq !== facetSeqRef.current) return { kind: "stale" };
    if (!availableIds) return { kind: "keep" };
    return { kind: "apply", facetCategoryIds: toFacetSelection(availableIds) };
  };

  /** 집계 결과를 검색 조건에 반영한다. `stale` 이면 아무것도 하지 않는다. */
  const applyFilters = (filters: SearchFilters, outcome: FacetOutcome) => {
    if (outcome.kind === "stale") return;
    setSearchParams((prev) => ({
      ...prev,
      ...filters,
      ...(outcome.kind === "apply" && { facetCategoryIds: outcome.facetCategoryIds }),
      page: 1,
    }));
  };

  const handleSearch = async (filters: SearchFilters) => {
    setSort(EMPTY_SORT);
    setSortResetKey((k) => k + 1);
    const outcome = await resolveFacetPatch(
      filters.keyword ?? "",
      filters.keywordOp ?? searchParams.keywordOp,
      "explicit",
    );
    applyFilters(filters, outcome);
  };

  /**
   * 실시간 리스트 검색 — 타이핑 중 디바운스로 들어온다 (REQ-001 / 2026-10-12 고객 메일 5번).
   *
   * `handleSearch` 와 달리 **정렬을 초기화하지 않는다.** 명시적 검색은 새 검색 의도지만
   * 실시간은 입력을 좁혀 가는 중이라, 사용자가 걸어 둔 컬럼 정렬이 글자마다 풀리면
   * 조작과 결과가 어긋난다 (목업 `runSearchDebounced()` 도 정렬을 건드리지 않는다).
   */
  const handleRealtimeSearch = async (filters: SearchFilters) => {
    const outcome = await resolveFacetPatch(
      filters.keyword ?? "",
      filters.keywordOp ?? searchParams.keywordOp,
      "realtime",
    );
    applyFilters(filters, outcome);
  };

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => ({ ...prev, page }));
  };

  // 탭 전환 — 조회 대상과 컬럼 구성이 완전히 달라지므로 정렬·페이지를 초기화한다.
  const handleViewChange = (view: ListView) => {
    setSort(EMPTY_SORT);
    setSortResetKey((k) => k + 1);
    setSearchParams((prev) => ({ ...prev, view, page: 1 }));
  };

  const handleFacetCategoryIdsChange = (ids: number[] | null) => {
    setSearchParams((prev) => ({ ...prev, facetCategoryIds: ids, page: 1 }));
  };

  const handleProductModelIdsChange = (ids: number[] | null) => {
    setSearchParams((prev) => ({ ...prev, productModelIds: ids, page: 1 }));
  };

  const handleRoleCodeChange = (roleCode: string) => {
    setSearchParams((prev) => ({ ...prev, roleCode, page: 1 }));
  };

  const handleDepartmentsChange = (departments: string[]) => {
    setSearchParams((prev) => ({ ...prev, departments, page: 1 }));
  };

  /**
   * 사내전용만 조회 토글.
   *
   * 켤 때 `roleCode` 를 함께 비운다 — 서버는 internalOnly 분기에서 roleCode 를 무시하므로
   * 남겨 두면 "조건에는 있는데 결과에 반영되지 않는 값" 이 되고, 끈 뒤에 그 값이 되살아나
   * 사용자가 설정한 적 없는 조건으로 조회된다 (목업 v0.94 요구 ⑤).
   */
  const handleInternalOnlyChange = (internalOnly: boolean) => {
    setSearchParams((prev) => ({
      ...prev,
      internalOnly,
      roleCode: internalOnly ? "" : prev.roleCode,
      page: 1,
    }));
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
        <p className="w-[var(--page-max)] max-w-full px-6 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
          カテゴリの読み込みに失敗しました。カテゴリ列・フィルターが表示されない場合があります。
        </p>
      )}
      {/* 목업 `.layout{grid-template-columns:296px minmax(0,1fr)}` — 좌측 사이드바가 **검색바와
          같은 높이**에서 시작하고, 검색바는 목록과 같은 폭(오른쪽 컬럼)이다.
          모바일은 1컬럼이라 DOM 순서 그대로 검색 → 토글 → 사이드바 → 목록 으로 쌓인다. */}
      {/* `lg:grid-rows-[auto_minmax(0,1fr)]` 필수 — 사이드바가 두 행에 걸치는데 행 높이가 auto 면
          사이드바의 남는 높이가 **두 행에 나눠 분배**되어 검색바 아래에 빈 공간이 생긴다.
          1행은 내용 높이로 고정하고 남는 높이는 2행(목록)이 가져간다. */}
      <div className="grid w-full grid-cols-1 gap-[10px] px-6 lg:w-[var(--page-max)] lg:grid-cols-[296px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:items-start lg:gap-[18px] lg:px-0">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <ContentsSearch
            // 복원 시 폼 state 가 초기값으로 동기화되도록 key 로 리마운트 제어
            // (react-hooks/set-state-in-effect 정책 — 부모에서 key prop 으로 리마운트 권장 패턴).
            // 한 번만 평가되는 shouldRestoreList 를 그대로 사용 — 검색 동작 중 리마운트 X.
            key={`mount-${shouldRestoreList ? "restore" : "fresh"}`}
            onSearch={handleSearch}
            onRealtimeSearch={handleRealtimeSearch}
            initialFilters={searchParams}
            // 자동완성 자료 후보의 분류 부제 — 축 선정을 사이드바·테이블과 같은 집합으로 맞춘다.
            categories={categories}
            isInternal={isInternal}
            userScope={userScope}
          />
        </div>
      {/* 모바일 상단 바 — 목업 v0.94 모바일(`assets/qp-mobile.js:152`)과 같은 구성:
          探し方 2버튼 옆에 `フィルタ` 열기 버튼. 데스크톱은 좌측 상설 사이드바가 대신한다. */}
      <div className="flex w-full items-stretch gap-[8px] lg:hidden">
        <ContentsModeSwitch compact view={searchParams.view} onViewChange={handleViewChange} />
        <button
          type="button"
          onClick={() => setIsFacetOpenMobile((prev) => !prev)}
          className="flex shrink-0 items-center gap-[6px] rounded-[8px] border border-[#eaf0f6] bg-white px-4 py-3 font-['Noto_Sans_JP'] text-[14px] font-medium text-[#45576f]"
          aria-expanded={isFacetOpenMobile}
        >
          フィルタ
          <span className="text-[11px] text-[#6a88a9]">{isFacetOpenMobile ? "▲" : "▼"}</span>
        </button>
      </div>

        <div
          className={`${isFacetOpenMobile ? "flex" : "hidden"} flex-col gap-[14px] lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:flex`}
        >
          {/* 모바일은 위 상단 바가 같은 역할을 한다 — 패널 안에서 중복 노출하지 않는다 */}
          <div className="hidden lg:block">
            <ContentsModeSwitch view={searchParams.view} onViewChange={handleViewChange} />
          </div>
          <ContentsFacets
            isInternal={isInternal}
            categories={categories}
            view={searchParams.view}
            selectedCategoryIds={searchParams.facetCategoryIds}
            selectedProductModelIds={searchParams.productModelIds}
            productAxis={productAxis}
            isProductAxisEnabled={isProductAxisEnabled}
            roleCode={searchParams.roleCode}
            departments={searchParams.departments}
            internalOnly={searchParams.internalOnly}
            onCategoryIdsChange={handleFacetCategoryIdsChange}
            onProductModelIdsChange={handleProductModelIdsChange}
            onRoleCodeChange={handleRoleCodeChange}
            onDepartmentsChange={handleDepartmentsChange}
            onInternalOnlyChange={handleInternalOnlyChange}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-[10px] lg:col-start-2 lg:row-start-2 lg:gap-[18px]">
          {isProductAxisError && (
            <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
              型番軸の読み込みに失敗しました。製品一覧の絞り込みが表示されない場合があります。
            </p>
          )}
          <ContentsTable
            isInternal={isInternal}
            viewerRoleCode={viewerRoleCode}
            categories={categories}
            data={contentsResponse?.data ?? []}
            meta={contentsResponse?.meta}
            // 쿼리 게이트(enabled=false) 시 isLoading=false 로 떨어지므로,
            // PAGE_SIZE 공통코드 로딩 중인 빈 시간을 로딩 상태로 표시 — 빈 화면 방지.
            isLoading={isLoading || (searchParams.view === "doc" && !isContentsQueryEnabled)}
            isError={isContentsError}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onSortChange={handleSortChange}
            sortResetKey={sortResetKey}
            initialSort={initialGridSort}
            view={searchParams.view}
            productData={productsResponse?.data ?? []}
            productMeta={productsResponse?.meta}
            // 型番 축 전부 해제는 조회 없이 0건 확정 — 로딩으로 보이면 안 된다.
            isProductLoading={
              isProductsLoading ||
              (searchParams.view === "prod" && !isProductsQueryEnabled)
            }
            isProductError={isProductsError}
            isProductAxisEnabled={isProductAxisEnabled}
          />
        </div>
      </div>
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
  /**
   * 제품상태 — 연결된 형번에서 서버가 파생한 값(REQ-005). `null` 이면 연결 형번이 없어
   * 화면에 「-」 를 찍는다. 자료가 직접 갖는 값이 아니므로 등록 화면에 입력란이 없다.
   */
  productStatus: "current" | "eol" | null;
}
