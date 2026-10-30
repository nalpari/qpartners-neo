"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { CategoryPath, Checkbox } from "@/components/common";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import api from "@/lib/axios";
import { ADMIN_MENU } from "@/lib/menu-codes";

/** 선택지 1건 — `GET /api/product-models` 응답 */
interface ProductModelOption {
  id: number;
  modelCode: string;
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
              className={`inline-flex items-center gap-[6px] rounded-full border bg-white py-1 pl-[10px] pr-[5px] ${
                model.isVisible
                  ? "border-[#C2CDDB]"
                  : "border-dashed border-[#C2CDDB] bg-[#F2F5F8]"
              }`}
            >
              <b className="font-mono text-[12px] text-[#101010]">{model.modelCode}</b>
              <CategoryPath
                category={model.category}
                className="font-['Noto_Sans_JP'] text-[11px] text-[#8a95a1]"
              />
              {!model.isVisible && (
                <span className="rounded-full border border-[#E4EAF0] bg-[#F2F5F8] px-[7px] py-[1px] font-['Noto_Sans_JP'] text-[10px] font-bold text-[#767676]">
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

      <p className="font-['Noto_Sans_JP'] text-[12px] text-[#152c42]">
        Total <span className="font-semibold text-[#E97923]">{total.toLocaleString()}</span>
      </p>

      {/* 선택 목록 — 높이 520px 고정 (2026-10-08 리뷰 결정) */}
      <div className="h-[520px] overflow-y-auto rounded-[6px] border border-[#EAF0F6] bg-white [scrollbar-gutter:stable]">
        <div className="sticky top-0 z-[1] grid grid-cols-[44px_minmax(150px,2fr)_minmax(150px,1fr)_110px] border-b border-[#C2CDDB] bg-[#506273] font-['Noto_Sans_JP'] text-[12px] font-semibold text-white">
          <span className="flex items-center justify-center px-0 py-[10px]">選択</span>
          <span className="flex items-center px-3 py-[10px]">カテゴリ</span>
          <span className="flex items-center px-3 py-[10px]">型番</span>
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
              className={`grid min-h-[44px] cursor-pointer grid-cols-[44px_minmax(150px,2fr)_minmax(150px,1fr)_110px] items-stretch border-b border-[#EFF4F8] text-[12.5px] last:border-b-0 hover:bg-[#F0F4F8] ${
                row.isVisible ? "" : "bg-[#F2F5F8]"
              }`}
            >
              <span className="flex items-center justify-center py-[10px]">
                <Checkbox
                  checked={selectedSet.has(row.id)}
                  onChange={(checked) => toggle(row, checked)}
                />
              </span>
              <span className="flex items-center px-3 py-[10px] font-['Noto_Sans_JP'] text-[#45576f]">
                <CategoryPath category={row.category} />
              </span>
              <span className="flex items-center overflow-hidden px-3 py-[10px] font-mono font-bold text-[#101010]">
                <span className="truncate" title={row.modelCode}>
                  {row.modelCode}
                </span>
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
          <span className="text-[#45576f]">
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
