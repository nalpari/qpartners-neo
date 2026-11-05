"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { CategoryName, Checkbox, ProductStatusBadge } from "@/components/common";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import api from "@/lib/axios";
import { ADMIN_MENU } from "@/lib/menu-codes";

/** 선택지 1건 — `GET /api/product-models` 응답 */
interface ProductModelOption {
  id: number;
  modelCode: string;
  /** 제품상태 — `GET /api/product-models` 가 `include` 로 이미 내려준다 (Redmine #2756) */
  status: "current" | "eol";
  isVisible: boolean;
  category: {
    id: number;
    name: string;
    /** 사내전용 카테고리 — 적색 표기 */
    isInternalOnly: boolean;
    parent: { id: number; name: string; isInternalOnly: boolean } | null;
  };
}

interface ProductModelListResponse {
  data: ProductModelOption[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

/** 선택 목록 1페이지 건수 — 목업 `mdlPageSize` */
const PAGE_SIZE = 20;

/** 형번명 검색 디바운스(ms) — 목업은 로컬 배열이라 즉시, 여기서는 매 타이핑이 서버 조회다 */
const SEARCH_DEBOUNCE_MS = 400;

interface ContentsFormProductModelsProps {
  /**
   * 선택된 형번 — **id 가 아니라 객체 배열**이다.
   *
   * 칩에 형번명·카테고리·표시여부를 보여줘야 하는데, 검색어나 페이지를 옮기면 그 형번이
   * 목록 응답에서 빠진다. 화면 안에 "본 적 있는 형번" 캐시를 두면 `useEffect` 에서
   * setState 를 하게 되어 React Compiler 의 `set-state-in-effect` 규칙에 걸린다
   * (`.claude/rules/react-components.md`). 체크하는 순간 행 객체를 그대로 올려보내면
   * 캐시도 효과도 필요 없다 — 저장 시 부모가 id 만 뽑아 쓴다.
   */
  selected: ProductModelOption[];
  onSelectedChange: (models: ProductModelOption[]) => void;
}

/**
 * 紐づく型番 선택 섹션 — 검색 고도화 REQ-009 / 목업 02 `.mdl-pick`.
 *
 * - **비표시(`isVisible=false`) 형번도 선택할 수 있다** (REQ-007 방침2) — 공개 준비 중인
 *   제품에 자료를 미리 붙여 둘 수 있어야 한다. 상태를 알 수 있게 `非表示` 뱃지를 붙인다.
 * - 목록 높이는 **520px 고정** (2026-10-08 현업 리뷰 결정).
 * - 조회는 `/api/product-models` — 그 가드가 `ADM_PRODUCT_MODEL.read` **또는**
 *   `CONTENT.create/update` 를 통과시키므로 콘텐츠 등록 권한만 있어도 선택지가 보인다.
 *
 * **필수 항목이 아니다.** 목업 헤더에는 `*` 가 붙어 있지만 저장 검증(`02:815~821`)은 타이틀과
 * 카테고리만 본다 — 형번에 묶이지 않는 자료(제품분류외)가 정상적으로 존재하기 때문이다.
 * 표기와 검증이 어긋난 목업 쪽 오류로 보고 `*` 를 붙이지 않았다.
 */
export function ContentsFormProductModels({
  selected,
  onSelectedChange,
}: ContentsFormProductModelsProps) {
  const [searchInput, setSearchInput] = useState("");
  const [modelCode, setModelCode] = useState("");
  /** 목업 `mdlShowHidden` — 기본 **체크**(비표시 포함) */
  const [includeHidden, setIncludeHidden] = useState(true);
  const [page, setPage] = useState(1);

  // 형번관리 링크는 권한이 있을 때만 — 없는 사용자에게 403 으로 끝나는 길을 보여주지 않는다.
  const { canRead: canReadProductModel } = useMenuPermission(ADMIN_MENU.PRODUCT_MODEL);

  useEffect(() => {
    if (searchInput === modelCode) return;
    const timer = setTimeout(() => {
      setModelCode(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, modelCode]);

  const { data, isLoading, isError } = useQuery<ProductModelListResponse>({
    queryKey: ["product-models", "picker", modelCode, includeHidden, page],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(PAGE_SIZE),
      };
      if (modelCode.trim()) params.modelCode = modelCode.trim();
      // 비표시 제외 = 표시만. 포함일 때는 파라미터를 보내지 않아 전체를 받는다.
      if (!includeHidden) params.isVisible = "true";
      const res = await api.get<ProductModelListResponse>("/product-models", { params });
      return res.data;
    },
    // ⚠️ `placeholderData: keepPreviousData` 를 쓰지 않는다. 키에 `modelCode`(검색어)·
    // `includeHidden`·`page` 가 들어 있어 조회 조건이 바뀔 때마다 새 쿼리가 되는데, 그때 이전
    // 데이터를 유지하면 **직전 조건의 행·건수가 현재 조건의 결과로 보인다** — 검색어를
    // 바꾼 직후 무관한 형번 20건이 결과처럼 뜨고, 페이저 라벨은 `2 / 5` 인데 행은 1페이지다.
    // `isLoading` 이 첫 로드 전용이 되어 `読み込み中...` 분기(아래)도 도달 불가가 된다.
    // 조회 중임을 드러내는 쪽을 택했다.
  });

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 0;

  const selectedSet = useMemo(() => new Set(selected.map((m) => m.id)), [selected]);

  const toggle = (model: ProductModelOption, checked: boolean) => {
    onSelectedChange(
      checked
        ? [...selected, model]
        : selected.filter((m) => m.id !== model.id),
    );
  };

  return (
    <section className="flex w-[var(--page-max)] flex-col gap-4 rounded-[12px] bg-white px-6 pt-[34px] pb-6 shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
      <h2 className="font-['Noto_Sans_JP'] text-[15px] font-medium leading-normal text-[#101010]">
        紐づく型番
      </h2>

      {/* 툴바 — 검색 / 비표시 포함 / 형번관리 링크 */}
      <div className="flex flex-wrap items-center gap-[10px]">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="型番を入力してください"
          className="h-[38px] flex-1 min-w-[200px] rounded-[4px] border border-[#C2CDDB] bg-white px-[10px] font-['Noto_Sans_JP'] text-[13px] text-[#101010] outline-none placeholder:text-[#999] focus:border-[#246097]"
        />
        <Checkbox
          checked={includeHidden}
          onChange={(checked) => {
            setIncludeHidden(checked);
            setPage(1);
          }}
          label="非表示の型番を含める"
        />
        {canReadProductModel && (
          <Link
            href="/admin/product-models"
            className="ml-auto font-['Noto_Sans_JP'] text-[12px] text-[#1060B4] hover:underline"
          >
            型番管理へ →
          </Link>
        )}
      </div>

      {/* 선택된 형번 칩 */}
      <div className="flex min-h-[44px] flex-wrap items-center gap-[7px] rounded-[6px] border border-[#EAF0F6] bg-[#F7F9FB] px-[10px] py-[9px]">
        {selected.length === 0 ? (
          <span className="font-['Noto_Sans_JP'] text-[12px] text-[#767676]">
            型番が選択されていません。下の一覧から選んでください。
          </span>
        ) : (
          selected.map((model) => (
            <span
              key={model.id}
              className={`inline-flex items-center gap-[8px] rounded-[8px] border bg-white py-[5px] pl-[12px] pr-[6px] ${
                model.isVisible
                  ? "border-[#C2CDDB]"
                  : "border-dashed border-[#C2CDDB] bg-[#F2F5F8]"
              }`}
            >
              <b className="font-mono text-[13px] text-[#101010]">{model.modelCode}</b>
              {/* Redmine #2756 — 목업(`02-contents-form`)의 선택 칩 형태에 맞춘다:
                  카테고리는 **2Depth 만**(1Depth 생략), 제품상태는 흐린 텍스트가 아니라
                  목록·상세와 같은 `ProductStatusBadge`. */}
              <CategoryName
                category={model.category}
                className="font-['Noto_Sans_JP'] text-[12px] text-[#8a95a1]"
              />
              <ProductStatusBadge status={model.status} />
              {!model.isVisible && (
                <span className="font-['Noto_Sans_JP'] text-[12px] font-semibold text-[#ff1a1a]">
                  非表示
                </span>
              )}
              <button
                type="button"
                onClick={() => toggle(model, false)}
                aria-label={`${model.modelCode} の選択を解除`}
                className="flex size-[18px] items-center justify-center rounded-full bg-[#F2F5F8] text-[13px] leading-none text-[#767676] transition-colors hover:bg-[#E97923] hover:text-white"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {/* key + translate="no" — 브라우저 자동 번역 **2종 방어** (Redmine #2763).
          번역 확장이 「Total N」 구간을 통째로 <font> 로 바꿔치기한 뒤 React 가 숫자만
          갱신하면 번역된 블록은 옛 건수 그대로 남는다. `key` 를 값에 묶어 두면 값이 바뀔 때
          요소를 통째로 새로 만들어 점유된 노드를 버린다. 자료일람 `合計`(`contents-table.tsx`)
          ·형번관리 `Total`(`product-models-search.tsx`) 이 같은 처리다.
          `translate="no"` 하나로는 막히지 않는다 — contents-table 에 실측 사례가 적혀 있다.

          건수는 **값이 있을 때만** 그린다. 종전에는 응답 전 `total` 이 `0` 이라 목록은 비어
          있는데 `Total 0` 이 떠서 「집계가 틀렸다」로 읽혔다(#2763 의 증상). 같은 순간 아래
          목록도 `読み込み中...` 라 표시가 어긋나지 않는다. `Total` 라벨은 남겨 레이아웃이
          흔들리지 않게 한다.

          `key` 에 로딩 상태를 함께 넣는 이유 — 0건 조회(`total === 0`)에서는 로딩 중과 결과가
          같은 키가 되어 빈 문자열→`0` 이 제자리 갱신이 되고, 그 경로가 위 점유 조건이다.

          조회 실패에 `0` 을 쓰면 「0건 조회됨」과 구분되지 않아 `-` 로 낸다 (2026-10-13 피드백 7). */}
      <p
        key={`total-${isError ? "err" : data ? total : "load"}`}
        className="font-['Noto_Sans_JP'] text-[12px] text-[#152c42]"
      >
        Total{" "}
        <span translate="no" className="font-semibold text-[#E97923]">
          {isError ? "-" : data ? total.toLocaleString() : ""}
        </span>
      </p>

      {/* 선택 목록 — 높이 520px 고정 (2026-10-08 리뷰 결정) */}
      <div className="h-[520px] overflow-y-auto rounded-[6px] border border-[#EAF0F6] bg-white [scrollbar-gutter:stable]">
        <div className="sticky top-0 z-[1] grid grid-cols-[44px_minmax(130px,1fr)_minmax(200px,2fr)_minmax(120px,0.36fr)_minmax(90px,0.27fr)] border-b border-[#C2CDDB] bg-[#506273] font-['Noto_Sans_JP'] text-[12px] font-semibold text-white">
          <span className="flex items-center justify-center px-0 py-[10px]">選択</span>
          <span className="flex items-center px-3 py-[10px]">カテゴリ</span>
          <span className="flex items-center px-3 py-[10px]">型番</span>
          {/* Redmine #2756 — 제품상태 컬럼 추가. 카테고리 열이 과하게 넓어 형번·상태가
              오른쪽 끝으로 밀려 있던 것도 함께 좁혔다. */}
          <span className="flex items-center justify-center px-3 py-[10px]">製品ステータス</span>
          <span className="flex items-center justify-center px-3 py-[10px]">表示／非表示</span>
        </div>

        {isLoading ? (
          <p className="p-[14px] font-['Noto_Sans_JP'] text-[12px] text-[#999]">
            読み込み中...
          </p>
        ) : isError ? (
          <p className="p-[14px] font-['Noto_Sans_JP'] text-[12px] text-[#ff1a1a]">
            型番の取得に失敗しました。時間をおいて再度お試しください。
          </p>
        ) : rows.length === 0 ? (
          <p className="p-[14px] font-['Noto_Sans_JP'] text-[12px] text-[#999]">
            該当する型番がありません。
          </p>
        ) : (
          rows.map((row) => (
            <label
              key={row.id}
              className={`grid min-h-[44px] cursor-pointer grid-cols-[44px_minmax(130px,1fr)_minmax(200px,2fr)_minmax(120px,0.36fr)_minmax(90px,0.27fr)] items-stretch border-b border-[#EFF4F8] text-[12.5px] last:border-b-0 hover:bg-[#F0F4F8] ${
                row.isVisible ? "" : "bg-[#F2F5F8]"
              }`}
            >
              <span className="flex items-center justify-center py-[10px]">
                <Checkbox
                  checked={selectedSet.has(row.id)}
                  onChange={(checked) => toggle(row, checked)}
                />
              </span>
              {/* Redmine #2755(공통) — 카테고리는 2Depth 만. 1Depth 까지 찍던 탓에
                  카테고리 열이 형번 열을 밀어내고 있었다(#2756). */}
              <span className="flex items-center px-3 py-[10px] font-['Noto_Sans_JP'] text-[#45576f]">
                <CategoryName category={row.category} />
              </span>
              <span className="flex items-center overflow-hidden px-3 py-[10px] font-mono font-bold text-[#101010]">
                <span className="truncate" title={row.modelCode}>
                  {row.modelCode}
                </span>
              </span>
              <span className="flex items-center justify-center px-3 py-[10px]">
                <ProductStatusBadge status={row.status} />
              </span>
              <span className="flex items-center justify-center px-3 py-[10px]">
                <span
                  className={`rounded-full border px-[7px] py-[1px] font-['Noto_Sans_JP'] text-[10.5px] font-bold ${
                    row.isVisible
                      ? "border-[#CFE7D8] bg-[#EAF6EE] text-[#2E6B3E]"
                      : "border-[#E4EAF0] bg-[#F2F5F8] text-[#767676]"
                  }`}
                >
                  {row.isVisible ? "表示" : "非表示"}
                </span>
              </span>
            </label>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="型番一覧のページ移動"
          className="flex items-center justify-center gap-2 font-['Noto_Sans_JP'] text-[12px]"
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-[4px] border border-[#b9cadd] bg-white px-3 py-[6px] text-[#315d89] disabled:opacity-40"
          >
            前へ
          </button>
          {/* `translate="no"` 만 둔다. `key` 는 필요 없다 — 이 `<nav>` 는 `totalPages > 1`
              조건 안이라 로딩 중(`totalPages === 0`)에는 통째로 언마운트되고, 값이 생길 때
              새로 마운트된다. 번역기가 점유할 낡은 노드가 남지 않는다. */}
          <span translate="no" className="text-[#45576f]">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-[4px] border border-[#b9cadd] bg-white px-3 py-[6px] text-[#315d89] disabled:opacity-40"
          >
            次へ
          </button>
        </nav>
      )}
    </section>
  );
}

export type { ProductModelOption };
