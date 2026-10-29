"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { SelectBox } from "@/components/common";
import api from "@/lib/axios";
import { MODEL_CODE_SEARCH_MIN } from "@/lib/schemas/product-model";

import type { CategoryNode, KeywordOp, SearchFilters } from "./contents-contents";
import {
  ContentsSearchSuggest,
  suggestOptionId,
  toSuggestNavItems,
  type SuggestData,
} from "./contents-search-suggest";

/**
 * 키워드 결합 조건 옵션 — 공백으로 구분된 검색어를 묶는 방식.
 * AND(기본): 한 필드 안에 모든 검색어 포함 / OR: 어느 하나라도 포함.
 */
const KEYWORD_OP_OPTIONS = [
  { value: "AND", label: "AND" },
  { value: "OR", label: "OR" },
];

/**
 * 입력이 멎고 나서 움직이기까지의 시간 — 목업 `DEBOUNCE_MS`(350) 와 같은 값.
 * 자동완성과 실시간 목록 검색이 **같은 타이머**를 쓴다(목업 `input` 핸들러와 동일).
 *
 * 타이핑 한 글자마다 서버를 때리지 않기 위한 것이기도 하지만, `/api/search/suggest` 는
 * 비사내 사용자에게 IP 당 60회/분 rate limit 을 건다(`checkSearchRateLimit`). 디바운스를
 * 없애면 긴 검색어 한 번으로 그 한도에 닿는다.
 */
const SEARCH_DEBOUNCE_MS = 350;

interface ContentsSearchProps {
  onSearch: (filters: SearchFilters) => void;
  /**
   * 실시간 리스트 검색 — 타이핑 중 자동으로 나가는 조회.
   *
   * `onSearch`(Enter·`検索`)와 나눈 이유는 **정렬 때문**이다. 명시적 검색은 새 검색 의도라
   * 그리드 정렬을 초기화하지만, 실시간은 입력을 좁혀 가는 중이라 사용자가 걸어 둔 컬럼
   * 정렬이 글자마다 풀리면 안 된다 (목업 `runSearchDebounced()` 도 정렬을 건드리지 않는다).
   */
  onRealtimeSearch: (filters: SearchFilters) => void;
  initialFilters?: SearchFilters;
  /** 자동완성 자료 후보의 분류 부제용 — 축 선정을 사이드바·테이블과 공유한다 */
  categories: CategoryNode[];
  isInternal: boolean;
  /** 권한별 캐시 분리 시드 — 자동완성 결과는 보는 사람의 노출범위에 따라 달라진다 */
  userScope: string;
}

/**
 * 콘텐츠 목록 검색바 — 검색 고도화 REQ-001/002.
 *
 * 구성은 목업 `01-search.html:514` 과 같다: `[AND/OR][키워드][✕][検索]`.
 * 분류 조건은 좌측 상설 사이드바(`contents-facets.tsx`)로 옮겨졌고, 종전 `詳細条件`
 * 패널은 제거됐다 (계획서 §5).
 *
 * **제거된 것과 남은 것**:
 * - 제거(UI): `詳細条件` 버튼·패널 / `掲示対象` 필터 / `担当部門` 필터 / `社内会員の掲示のみ表示`
 * - 유지: 키워드 `AND`/`OR` — 목업도 검색바 안에 두고 있다(`:515` `<select id="keywordMode">`).
 *   v1.0 계획서가 제거 목록에 넣었던 것은 패널째로 묶은 오류이며 §5 에서 정정됐다.
 * - 제거된 필터의 **서버 파라미터와 필터 로직은 그대로 남겨** 두었다 (§5 「복구 가능하게 둔다」).
 *   화면만 다시 붙이면 되살아난다. 그래서 이 컴포넌트는 그 값들을 **그대로 통과**시킨다.
 *
 * **자동완성(REQ-001)** 은 입력창 아래 드롭다운으로 붙는다 (`contents-search-suggest.tsx`,
 * 목업 `01-search.html:530`). 목록 조회와는 별개 경로다 — 후보 클릭은 검색을 실행하지 않고
 * 해당 제품상세·자료상세로 바로 이동하며(목업 `openProduct()`/`openDoc()`), 목록을 갱신하는
 * 것은 종전대로 `検索` 버튼과 Enter 뿐이다.
 */
export function ContentsSearch({
  onSearch,
  onRealtimeSearch,
  initialFilters,
  categories,
  isInternal,
  userScope,
}: ContentsSearchProps) {
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? "");
  const [keywordOp, setKeywordOp] = useState<KeywordOp>(initialFilters?.keywordOp ?? "AND");

  // [x] 클릭 후 input 으로 focus 복귀용 — 클릭으로 button 이 focus 를 가지면 이어진 Enter 가
  // input 의 onKeyDown 이 아니라 button 의 click 을 다시 트리거해 검색이 동작하지 않는다 (#2169).
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ── 자동완성 (REQ-001) ──────────────────────────────────────────────────
  // 드롭다운 열림 여부와 **조회에 쓸 확정 키워드**를 나눠 둔다. 입력값(`keyword`)을 그대로
  // queryKey 에 넣으면 글자마다 요청이 나간다.
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  /** 키보드로 고른 후보. -1 = 미선택 — 이 상태에서 Enter 는 **검색**이다. */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestQuery, setSuggestQuery] = useState(initialFilters?.keyword ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 바깥 클릭 판정용 — SelectBox 와 같은 방식(포커스가 래퍼 밖으로 나가면 닫는다).
  const searchWrapRef = useRef<HTMLDivElement>(null);
  // 목록에 **이미 적용된** 검색어. 입력값(`keyword`)과 다를 수 있다 — 3자 미만으로 지우면
  // 목록은 직전 결과를 유지하기 때문이다. 같은 검색어를 두 번 보내지 않으려고 둔다.
  const appliedKeywordRef = useRef(initialFilters?.keyword ?? "");

  // 언마운트 시 대기 중인 타이머만 정리한다. setState 는 하지 않는다
  // (react-hooks/set-state-in-effect — `.claude/rules/react-components.md`).
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const trimmedSuggestQuery = suggestQuery.trim();
  const { data: suggestData } = useQuery<SuggestData>({
    queryKey: ["search", "suggest", trimmedSuggestQuery, userScope],
    queryFn: async () => {
      const res = await api.get<{ data: SuggestData }>(
        `/search/suggest?q=${encodeURIComponent(trimmedSuggestQuery)}`,
      );
      return res.data.data;
    },
    // 3자 게이트의 판정은 서버가 단일 출처다(미달이면 빈 결과를 돌려준다).
    // 여기서 같은 기준으로 한 번 더 끊는 것은 **요청 자체를 아끼기 위함**이다.
    //
    // `isSuggestOpen` 도 함께 건다. 검색어를 들고 복원된 목록(`initialFilters.keyword`)은
    // 드롭다운이 닫힌 채로 뜨는데, 그 상태에서 조회하면 **아무도 안 보는 후보**를 받아 온다.
    // 포커스가 들어오면 그 시점에 바로 나간다 (목업 `searchInput.addEventListener("focus", …)`).
    enabled: isSuggestOpen && trimmedSuggestQuery.length >= MODEL_CODE_SEARCH_MIN,
    staleTime: 60 * 1000,
  });

  /** 드롭다운을 닫고 대기 중인 자동완성 조회도 취소한다 — 명시적 검색·이동 직후에 쓴다. */
  const closeSuggest = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsSuggestOpen(false);
    setActiveIndex(-1);
  };

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    setIsSuggestOpen(true);
    // 후보 목록이 바뀌므로 선택을 푼다 — 안 풀면 "3번째" 가 다른 항목을 가리키게 된다.
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // 이벤트 핸들러에서 거는 타이머다 — useEffect 안의 setState 가 아니므로 Compiler 규칙에 걸리지 않는다.
    debounceRef.current = setTimeout(() => {
      setSuggestQuery(value);

      // ── 실시간 리스트 검색 (REQ-001 / 2026-10-12 고객 메일 5번) ──
      // 「제목만 검색 → 실시간 리스트 검색 적용 가능」. 본문을 뺀 대가로 얻는 동작이다.
      //
      // 3자 미만이면 **검색어만 빼고 현재 조건 그대로 다시 조회한다** — 목업
      // `eff = v.trim().length >= MIN_Q ? v : ""` 와 같다 (2026-10-13 사용자 결정).
      // 분류축·형번축·정렬은 `buildFilters` 가 그대로 통과시키므로 살아남고, 키워드만 풀린다.
      const trimmed = value.trim();
      const effective = trimmed.length >= MODEL_CODE_SEARCH_MIN ? value : "";
      // 이미 적용된 검색어와 같으면 보내지 않는다 (목업 `if (eff === state.query) return;`).
      // 빈 상태에서 1~2자를 치는 동안 같은 빈 조회가 반복되는 것도 이 비교가 막는다.
      if (effective === appliedKeywordRef.current) return;
      appliedKeywordRef.current = effective;
      onRealtimeSearch(buildFilters(effective));
    }, SEARCH_DEBOUNCE_MS);
  };

  // 포커스가 검색바 바깥으로 나가면 닫는다. 후보(Link)는 래퍼 안에 있어 클릭이 먼저 성립한다.
  const handleWrapBlur = (e: React.FocusEvent) => {
    if (!searchWrapRef.current?.contains(e.relatedTarget)) setIsSuggestOpen(false);
  };

  /** 조회 조건 묶음 — 명시적 검색과 실시간 검색이 같은 형태를 보낸다. */
  const buildFilters = (value: string): SearchFilters => ({
    keyword: value,
    keywordOp,
    // UI 가 제거된 필터들 — 복구 지점을 남기기 위해 값은 그대로 통과시킨다.
    categoryIds: initialFilters?.categoryIds ?? [],
    roleCode: initialFilters?.roleCode ?? "",
    departments: initialFilters?.departments ?? [],
    internalOnly: initialFilters?.internalOnly ?? false,
  });

  const handleSearch = () => {
    closeSuggest();
    appliedKeywordRef.current = keyword;
    onSearch(buildFilters(keyword));
  };

  // [x] 클릭 — 입력값만 비우고 재조회는 트리거하지 않는다. 사용자가 명시적으로 検索/Enter 를
  // 눌렀을 때만 검색한다. focus 를 input 으로 되돌려 이어진 Enter 가 button click 재트리거가
  // 아니라 input onKeyDown 으로 처리되게 한다 (#2169).
  const handleClearKeyword = () => {
    setKeyword("");
    setSuggestQuery("");
    closeSuggest();
    keywordInputRef.current?.focus();
  };

  // 드롭다운이 그리는 순서와 **같은 순서**의 이동 대상 목록. 순서 규칙은 한 곳에만 둔다.
  const navItems = toSuggestNavItems(suggestData);
  const isSuggestVisible = isSuggestOpen && navItems.length > 0;

  /** ↓/↑ — 포커스는 입력창에 둔 채 선택만 옮긴다(aria-activedescendant 패턴). 끝에서 순환한다. */
  const moveActive = (delta: number) => {
    setActiveIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return navItems.length - 1;
      if (next >= navItems.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 조합 중에는 방향키가 변환 후보를 고르는 키다. 가로채면 일본어 입력이 망가진다.
    if (!e.nativeEvent.isComposing && isSuggestVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault(); // 캐럿이 입력 끝으로 튀는 기본동작 차단
        moveActive(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1);
        return;
      }
    }

    // 후보를 고른 상태의 Enter — **검색이 아니라 그 후보로 이동**한다 (2026-10-13 요청).
    // 고르지 않았으면(-1) 아래 기존 분기로 떨어져 그 검색어로 조회한다.
    if (
      e.key === "Enter" &&
      !e.nativeEvent.isComposing &&
      isSuggestVisible &&
      activeIndex >= 0 &&
      activeIndex < navItems.length
    ) {
      e.preventDefault();
      const target = navItems[activeIndex].href;
      closeSuggest();
      router.push(target, { transitionTypes: ["fade"] });
      return;
    }

    // Escape — 드롭다운만 닫는다. 입력값도 목록도 건드리지 않는다.
    //
    // 바깥 클릭만으로는 부족하다: 드롭다운이 바로 아래의 `資料一覧`/`製品一覧` 탭과 목록
    // 윗부분을 덮으므로, 그 자리를 누르면 "바깥을 눌렀다"가 아니라 **후보를 누른 것**이 되어
    // 의도치 않게 상세로 이동한다. 키보드로 빠져나갈 수단이 반드시 있어야 한다.
    //
    // IME 조합 중 Escape 는 조합 취소라 가로채지 않는다.
    if (e.key === "Escape" && !e.nativeEvent.isComposing) {
      closeSuggest();
      return;
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  return (
    // 폭은 바깥 그리드가 정한다 — 목업 `.layout{grid-template-columns:296px minmax(0,1fr)}` 에서
    // 검색바는 **오른쪽 컬럼(`<main>`) 안**에 있어 목록과 같은 폭이고, 좌측 사이드바가 검색바와
    // 같은 높이에서 시작한다. 좌우 여백도 그리드가 준다(모바일 `px-6`).
    <div className="flex w-full min-w-0 flex-col gap-2">
      {/* relative — 자동완성 드롭다운의 기준 박스 */}
      <div
        ref={searchWrapRef}
        onBlur={handleWrapBlur}
        className="relative flex items-center gap-2 pt-[18px] pb-2 lg:pt-0 lg:pb-0"
      >
        {/* 키워드 결합 조건 — 검색창 좌측. 검색어를 공백으로 나눈 뒤 AND/OR 로 묶는다.
            공용 SelectBox 는 다른 화면 13곳이 쓰므로 건드리지 않고, 이 화면 한정으로 트리거
            버튼만 옆 검색창 스타일(h-60 / rounded-8 / 보더 없음 / 동일 shadow / pl-5)에 맞춘다.

            선택자 주의: SelectBox 는 `div.relative` 래퍼 안에 트리거 button 을 둔다.
            `[&>button]` 은 래퍼에 막혀 아무것도 못 잡으므로 `[&>div>button]` 이어야 한다.
            드롭다운 옵션 button 은 한 단계 더 깊어(`>div>div>button`) 영향을 받지 않는다.

            보더는 기본/hover/focus 3상태 모두 투명으로 덮는다 — 한 상태만 빠뜨리면
            마우스오버·클릭 때만 회색 테두리가 튀어나온다. 포커스 표시는 outline 으로 유지. */}
        <div className="w-[110px] shrink-0 [&>div>button]:h-[60px] [&>div>button]:rounded-[8px] [&>div>button]:pl-5 [&>div>button]:pr-4 [&>div>button]:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] [&>div>button]:border-transparent [&>div>button:hover]:border-transparent [&>div>button:focus]:border-transparent [&>div>button:focus-visible]:[outline:2px_solid_#246097]">
          <SelectBox
            options={KEYWORD_OP_OPTIONS}
            value={keywordOp}
            onChange={(v) => setKeywordOp(v === "OR" ? "OR" : "AND")}
          />
        </div>
        <div className="flex flex-1 min-w-0 items-start bg-white rounded-[8px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden h-[60px]">
          <div className="flex flex-1 min-w-0 items-center h-[60px] pl-5">
            <input
              ref={keywordInputRef}
              type="text"
              value={keyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsSuggestOpen(true)}
              autoComplete="off"
              // 포커스는 입력창에 둔 채 목록을 고르는 조합 — combobox + aria-activedescendant.
              role="combobox"
              aria-expanded={isSuggestVisible}
              aria-controls="contents-suggest-listbox"
              aria-activedescendant={
                isSuggestVisible && activeIndex >= 0 ? suggestOptionId(activeIndex) : undefined
              }
              placeholder="キーワードを入力してEnterで検索"
              className="flex-1 min-w-0 font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] placeholder:text-[#999] outline-none bg-transparent"
            />
          </div>
          <button
            type="button"
            className="flex items-center justify-center size-[60px] shrink-0"
            onClick={handleClearKeyword}
            aria-label="キーワードをクリア"
          >
            <Image
              src="/asset/images/layout/search_delete.svg"
              alt=""
              width={60}
              height={60}
              unoptimized
            />
          </button>
          <button
            type="button"
            className="flex items-center justify-center h-full px-6 lg:px-5 bg-[#246097] shrink-0 transition-colors duration-150 hover:bg-[#1d4f7d]"
            onClick={handleSearch}
          >
            <span className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-white whitespace-nowrap">
              検索
            </span>
          </button>
        </div>

        {isSuggestOpen && (
          <ContentsSearchSuggest
            data={suggestData}
            query={trimmedSuggestQuery}
            categories={categories}
            isInternal={isInternal}
            activeIndex={activeIndex}
            onSelect={closeSuggest}
          />
        )}
      </div>
    </div>
  );
}
