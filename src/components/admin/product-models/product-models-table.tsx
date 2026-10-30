"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  CellClassParams,
  CellClickedEvent,
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  ValueGetterParams,
} from "ag-grid-community";

import { DataGrid } from "@/components/ag-grid/data-grid";
import { CategoryPath, Pagination, ProductStatusBadge } from "@/components/common";
import { CENTER_CELL_STYLE } from "@/lib/constants";

import { ProductModelsSearch } from "./product-models-search";
import {
  formatCategoryLabel,
  formatDate,
  type ProductCategoryOption,
  type ProductModelItem,
  type ProductModelSearchFilters,
} from "./product-models-types";

interface ProductModelsTableProps {
  items: ProductModelItem[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  filters: ProductModelSearchFilters;
  categoryOptions: ProductCategoryOption[];
  page: number;
  pageSize: number;
  /** 편집 중인 형번 id — 해당 행을 하이라이트한다 (목업 `is-editing`) */
  editingId: number | null;
  /** 初期化 시 검색 입력 버퍼를 비우기 위한 리마운트 토큰 */
  searchResetKey: number;
  onFiltersChange: (filters: ProductModelSearchFilters) => void;
  onResetFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelect: (model: ProductModelItem) => void;
}

/** 편집 중 행 하이라이트 — 메뉴관리와 같은 cell 단위 클래스 방식 (ag-grid-theme.css 주석 참조) */
function editingCellClass(params: CellClassParams<ProductModelItem>): string | undefined {
  const ctx = params.context as { editingId: number | null } | undefined;
  return ctx?.editingId && params.data?.id === ctx.editingId
    ? "ag-cell-row-editing"
    : undefined;
}

/**
 * 형번 목록 — 목업 03 `型番一覧` 카드.
 *
 * 컬럼 8개: `No / 型番 / カテゴリ / カテゴリ順序 / 製品ステータス / 型番順序 / 表示／非表示 / 登録日`
 * (v0.8.1 대비 `更新日`→`登録日` 로 바뀌고 `操作` 컬럼이 빠졌다 — 대응표 §0 발견 E.
 *  `表示順序` 는 2026-10-20 業務レビュー로 `カテゴリ順序`·`型番順序` 2개로 분리됐다.)
 *
 * **행 클릭이 편집 진입**이다. 목업이 편집 버튼을 두지 않은 이유를 그대로 따른다
 * (`03-admin-models.html:462` 「行をクリックしたら編集状態にする（編集ボタンは置かない）」).
 */
export function ProductModelsTable({
  items,
  total,
  totalPages,
  isLoading,
  isError,
  filters,
  categoryOptions,
  page,
  pageSize,
  editingId,
  searchResetKey,
  onFiltersChange,
  onResetFilters,
  onPageChange,
  onPageSizeChange,
  onSelect,
}: ProductModelsTableProps) {
  // 페이지 내 일련번호의 기준 — 목업도 `offset + i + 1` 로 전체 기준 번호를 쓴다.
  const offset = (page - 1) * pageSize;

  const gridApiRef = useRef<GridApi<ProductModelItem> | null>(null);

  const handleGridReady = useCallback((event: GridReadyEvent<ProductModelItem>) => {
    gridApiRef.current = event.api;
  }, []);

  // cellClass 는 context 가 바뀌어도 자동 재평가되지 않는다 — 명시적으로 갱신한다.
  // `isDestroyed()` 가드는 메뉴관리와 동일 — 언마운트 직후 타이밍에 호출되면 예외가 난다.
  //
  // `items` 도 의존성이다. `getRowId` 로 행을 id 매칭하는 동안 **살아남은 행의 셀은
  // 재평가되지 않아서**, 등록·삭제로 순서가 밀려도 `No`(rowIndex 파생)가 옛 값으로 남는다
  // — 앞쪽에 행이 끼어들면 `1, 1, 2, 3…` 처럼 어긋났다 (2026-10-14).
  useEffect(() => {
    const api = gridApiRef.current;
    if (!api || api.isDestroyed()) return;
    api.refreshCells({ force: true });
  }, [editingId, items]);

  const handleCellClicked = useCallback(
    (event: CellClickedEvent<ProductModelItem>) => {
      if (event.data) onSelect(event.data);
    },
    [onSelect],
  );

  const VisibilityCellRenderer = useMemo(() => {
    const Renderer = (params: ICellRendererParams<ProductModelItem>) => {
      const row = params.data;
      if (!row) return null;
      // 색은 목업 토큰(`qp-tokens.css`)의 ok/neu 쌍. 형번 기능 자체가 neo 에 없어
      // 대조할 기존 구현이 없는 신규 컴포넌트다 (목업 판단을 따르는 범위).
      const style = row.isVisible
        ? "bg-[#EAF6EE] border-[#CFE7D8] text-[#2E6B3E]"
        : "bg-[#F2F5F8] border-[#E4EAF0] text-[#767676]";
      return (
        <span
          className={`inline-flex items-center h-[24px] px-[10px] rounded-full border font-['Noto_Sans_JP'] text-[12px] font-medium ${style}`}
        >
          {row.isVisible ? "表示" : "非表示"}
        </span>
      );
    };
    return Renderer;
  }, []);

  /** 제품상태 배지 — 공용 컴포넌트(목업 `.badge.ok`/`.badge.eol` 토큰)를 그대로 쓴다. */
  const StatusCellRenderer = useMemo(() => {
    const Renderer = (params: ICellRendererParams<ProductModelItem>) =>
      params.data ? <ProductStatusBadge status={params.data.status} /> : null;
    return Renderer;
  }, []);

  /**
   * 형번 셀을 버튼으로 렌더한다.
   *
   * 행 클릭(onCellClicked)만으로는 **키보드로 편집에 진입할 수 없다** — AG Grid 의
   * 키보드 내비게이션은 셀 포커스만 옮기고 click 이벤트를 발생시키지 않는다.
   * 공지관리가 제목 셀을 버튼으로 두는 것과 같은 이유다.
   * 클릭 시 onCellClicked 도 함께 타지만 같은 행이라 결과가 바뀌지 않는다.
   *
   * **hover 밑줄은 두지 않는다** (2026-10-14 사용자 지시). 편집 진입은 행 어디를 눌러도
   * 되는데, 형번 글자에만 밑줄이 뜨면 「이 셀만 클릭 대상」으로 읽힌다 — 표시와 동작이
   * 어긋난다. 버튼 자체는 키보드 진입 수단이라 그대로 둔다.
   */
  const ModelCodeCellRenderer = useMemo(() => {
    const Renderer = (params: ICellRendererParams<ProductModelItem>) => {
      const row = params.data;
      if (!row) return null;
      const ctx = params.context as { onSelect: (model: ProductModelItem) => void };
      return (
        <button
          type="button"
          onClick={() => ctx.onSelect(row)}
          className="font-mono text-[14px] font-semibold text-[#101010] text-left overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer"
          title={row.modelCode}
        >
          {row.modelCode}
        </button>
      );
    };
    return Renderer;
  }, []);

  const columnDefs = useMemo<ColDef<ProductModelItem>[]>(
    () => [
      {
        headerName: "No",
        colId: "_no",
        // 4자리(1000번대) 행번호까지 들어갈 폭. 목업은 44px 이지만 테마 셀 패딩이 더 크다.
        width: 72,
        minWidth: 72,
        maxWidth: 72,
        resizable: false,
        valueGetter: (p: ValueGetterParams<ProductModelItem>) =>
          offset + (p.node?.rowIndex ?? 0) + 1,
        cellStyle: CENTER_CELL_STYLE,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "型番",
        field: "modelCode",
        flex: 1.8,
        cellRenderer: ModelCodeCellRenderer,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "カテゴリ",
        colId: "category",
        // 1Depth > 2Depth 전체 표기가 들어가야 한다. 개발 DB 실측 글자폭은
        // `製品分類 > パワーコンディショナ` 약 217px, 제품일람 대상 10건 최장 231px.
        // 셀 좌우 패딩은 테마(`cellHorizontalPadding: 18`) 기준이며 브라우저 실측을
        // 하지 않았으므로 여유를 두고 268 로 둔다. 초과분은 아래 말줄임·툴팁이 받는다.
        flex: 2.4,
        minWidth: 268,
        // valueGetter 는 유지 — 정렬·툴팁·내보내기가 문자열을 본다. 색만 renderer 로 얹는다.
        valueGetter: (p: ValueGetterParams<ProductModelItem>) =>
          p.data ? formatCategoryLabel(p.data.category) : "",
        // cellRenderer 컬럼은 셀이 flex 컨테이너라 상위 ellipsis 가 먹지 않는다
        // (`ag-grid-theme.css` 주석) — renderer 안에서 직접 처리하고 툴팁을 단다.
        tooltipValueGetter: (p) => (p.data ? formatCategoryLabel(p.data.category) : ""),
        cellRenderer: (p: ICellRendererParams<ProductModelItem>) =>
          p.data ? (
            <CategoryPath
              category={p.data.category}
              className="overflow-hidden text-ellipsis whitespace-nowrap"
            />
          ) : null,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        // REQ-007 「제품 카테고리 순서 : 카테고리 관리에서 설정한 순서를 조회용 제공」.
        // 형번관리에서 바꾸는 값이 아니다 — 정본은 카테고리 관리 화면이다.
        headerName: "カテゴリ順序",
        colId: "categorySortOrder",
        flex: 0.8,
        // 헤더 `カテゴリ順序` 6전각자 ≈ 84px + 헤더 좌우 패딩. 96 으로는 모자랐다.
        minWidth: 120,
        valueGetter: (p: ValueGetterParams<ProductModelItem>) =>
          p.data?.category.sortOrder ?? "",
        cellStyle: CENTER_CELL_STYLE,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "製品ステータス",
        colId: "status",
        flex: 1.2,
        cellRenderer: StatusCellRenderer,
        cellStyle: CENTER_CELL_STYLE,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "型番順序",
        field: "sortOrder",
        flex: 0.8,
        cellStyle: CENTER_CELL_STYLE,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "表示／非表示",
        colId: "isVisible",
        flex: 1,
        cellRenderer: VisibilityCellRenderer,
        cellStyle: CENTER_CELL_STYLE,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 1,
        valueFormatter: (p) => formatDate(p.value as string),
        cellStyle: CENTER_CELL_STYLE,
        cellClass: editingCellClass,
        headerClass: "ag-header-cell-center",
      },
    ],
    [offset, ModelCodeCellRenderer, VisibilityCellRenderer, StatusCellRenderer],
  );

  const gridContext = useMemo(() => ({ editingId, onSelect }), [editingId, onSelect]);

  return (
    <div className="flex min-w-0 flex-[6] flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px]">
      <h2 className="font-['Noto_Sans_JP'] text-[16px] font-medium text-[#45576f]">
        型番一覧
      </h2>

      <ProductModelsSearch
        key={searchResetKey}
        filters={filters}
        categoryOptions={categoryOptions}
        total={total}
        isError={isError}
        pageSize={pageSize}
        onFiltersChange={onFiltersChange}
        onReset={onResetFilters}
        onPageSizeChange={onPageSizeChange}
      />

      <div className="flex flex-col gap-6">
        <DataGrid<ProductModelItem>
          columnDefs={columnDefs}
          rowData={items}
          loading={isLoading}
          context={gridContext}
          onGridReady={handleGridReady}
          onCellClicked={handleCellClicked}
          getRowId={(p) => String(p.data.id)}
          autoHeight={!(isLoading || items.length === 0)}
          maxHeight={isLoading || items.length === 0 ? 200 : undefined}
          emptyMessage={
            isError
              ? "型番の読み込みに失敗しました。ページを更新してください。"
              : "該当する型番がありません。"
          }
        />
        {totalPages > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}
