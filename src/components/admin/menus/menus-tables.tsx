"use client";

import { useMemo, useCallback, useRef, useEffect } from "react";
import type { ColDef, ICellRendererParams, GridApi, GridReadyEvent } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { MenuItem } from "./menus-types";

// Design Ref: §5.3 — 1-Level + 2-Level 테이블

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

// --- AG Grid Context 타입 (as 캐스팅 1회로 집약) ---
interface MenusGridContext {
  selectedLevel1Id?: string | null;
  onLevel1Click?: (id: string) => void;
  onLevel2Click?: (id: string) => void;
  onSortValueChange?: (id: string, v: number) => void;
}

function toCtx(context: unknown): MenusGridContext {
  return (context ?? {}) as MenusGridContext;
}

// --- Cell Renderers (컴포넌트 바깥 정의 — AG Grid 리렌더링 최적화) ---

function MenuNameRenderer(params: ICellRendererParams<MenuItem>) {
  const data = params.data;
  if (!data) return null;
  const ctx = toCtx(params.context);
  return (
    <button
      type="button"
      className="text-[#1060B4] underline cursor-pointer font-['Noto_Sans_JP'] text-[14px] text-left"
      onClick={() => ctx.onLevel1Click?.(data.id)}
    >
      {data.menuName}
    </button>
  );
}

function Level2MenuNameRenderer(params: ICellRendererParams<MenuItem>) {
  const data = params.data;
  if (!data) return null;
  const ctx = toCtx(params.context);
  return (
    <button
      type="button"
      className="text-[#1060B4] underline cursor-pointer font-['Noto_Sans_JP'] text-[14px] text-left"
      onClick={() => ctx.onLevel2Click?.(data.id)}
    >
      {data.menuName}
    </button>
  );
}

function TextRenderer(params: ICellRendererParams<MenuItem>) {
  return (
    <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
      {String(params.value ?? "")}
    </span>
  );
}

function SortCellRenderer(params: ICellRendererParams<MenuItem>) {
  const data = params.data;
  if (!data) return null;
  const ctx = toCtx(params.context);
  // AG Grid는 context 변경만으로 셀을 re-render하지 않으므로 controlled input을 쓰면
  // 입력값이 화면에 반영되지 않는다. uncontrolled(defaultValue) + key로 처리:
  //   - 평소엔 브라우저가 키 입력을 그대로 표시(타이핑 자유)
  //   - 외부 값(data.sortOrder)이 바뀌면 key 변화로 input remount → defaultValue 갱신
  //   - 저장 후 server 값과 typed 값이 같거나, server 가 행을 갱신 안 한 경우엔
  //     상위에서 DataGrid 자체에 key 를 부여해 grid 를 remount → 모든 input 재초기화
  return (
    <input
      key={data.sortOrder}
      type="number"
      min={1}
      defaultValue={data.sortOrder}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const val = Number(e.target.value);
        if (Number.isInteger(val) && val >= 1) ctx.onSortValueChange?.(data.id, val);
      }}
      className="w-[60px] h-[38px] px-2 text-center bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] outline-none focus:border-[#101010] sort-input-no-spinner"
    />
  );
}

interface MenusTablesProps {
  level1Data: MenuItem[];
  level2Data: MenuItem[];
  selectedLevel1Id: string | null;
  selectedLevel1Name: string;
  /** 현재 폼에 바인딩된 메뉴 id — 2-Level 행 하이라이트용. null 이면 신규 모드. */
  editingId: string | null;
  activeOnly: boolean;
  onActiveFilterChange: (checked: boolean) => void;
  onLevel1Click: (id: string) => void;
  onLevel2Click: (id: string) => void;
  onSortSave: () => void;
  onSortValueChange: (id: string, value: number) => void;
  isSortSaving: boolean;
  sortRefreshVersion: number;
  onDelete: () => void;
  isDeleteEnabled: boolean;
  isDeleting: boolean;
}

export function MenusTables({
  level1Data,
  level2Data,
  selectedLevel1Id,
  selectedLevel1Name,
  editingId,
  activeOnly,
  onActiveFilterChange,
  onLevel1Click,
  onLevel2Click,
  onSortSave,
  onSortValueChange,
  isSortSaving,
  sortRefreshVersion,
  onDelete,
  isDeleteEnabled,
  isDeleting,
}: MenusTablesProps) {

  // --- Column Defs ---
  // useMemo 로 안정화 — 부모 리렌더 시 새 ColDef 배열이 AG Grid 로 흘러가면 셀 rebuild
  // 가능성이 있어 uncontrolled <input> 의 타이핑값이 손실됨. 컬럼 구조는 정적이므로 빈 deps.

  const level1Columns = useMemo<ColDef<MenuItem>[]>(() => [
    {
      headerName: "Menu Name",
      field: "menuName",
      flex: 2,
      cellRenderer: MenuNameRenderer,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "使用可否",
      field: "isActive",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "モバイル",
      field: "showInMobile",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Top",
      field: "showInTopNav",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Sort",
      field: "sortOrder",
      flex: 0.6,
      cellRenderer: SortCellRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: () => true,
    },
  ], []);

  const level2Columns = useMemo<ColDef<MenuItem>[]>(() => [
    {
      headerName: "Menu Name",
      field: "menuName",
      flex: 2,
      cellRenderer: Level2MenuNameRenderer,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "使用可否",
      field: "isActive",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "モバイル",
      field: "showInMobile",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Sort",
      field: "sortOrder",
      flex: 0.6,
      cellRenderer: SortCellRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: () => true,
    },
  ], []);

  // --- Row Class (선택 하이라이트) ---

  const getLevel1RowClass = useCallback((params: RowClassParams<MenuItem>) => {
    if (params.data?.id === selectedLevel1Id) return "ag-row-selected-menu";
    return undefined;
  }, [selectedLevel1Id]);

  // 2-Level 하이라이트 — 현재 폼에 바인딩된 자식(editingId)만 강조. editingId 가
  // 1-Level 인 경우엔 level2 row id 와 매칭되지 않아 자연스럽게 하이라이트 없음.
  const getLevel2RowClass = useCallback((params: RowClassParams<MenuItem>) => {
    if (editingId && params.data?.id === editingId) return "ag-row-selected-menu";
    return undefined;
  }, [editingId]);

  // AG Grid 의 getRowClass 는 행 생성 시점에 한 번만 평가되고 prop 변경 시 자동
  // 재평가되지 않는다. selectedLevel1Id / editingId 가 바뀌어도 이전 선택 행의
  // 하이라이트가 그대로 남는 현상을 redrawRows() 로 강제 재평가해 해소.
  //
  // ⚠️ redrawRows() 는 row DOM 을 즉시 teardown→recreate 하는데, React cellRenderer
  // (MenuNameRenderer 등) 가 같은 노드를 관리해 React 의 commit phase 와 충돌해
  // "removeChild ... not a child of this node" 런타임 에러가 발생할 수 있다.
  // queueMicrotask 로 React commit 직후 다음 마이크로태스크에서 호출해 회피.
  // grid 가 unmount 된 시점이면 ref 가 유효해도 호출이 noop 이 되도록 in-flight 가드.
  const level1GridApiRef = useRef<GridApi<MenuItem> | null>(null);
  const handleLevel1GridReady = useCallback((event: GridReadyEvent<MenuItem>) => {
    level1GridApiRef.current = event.api;
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const api = level1GridApiRef.current;
      if (!api || api.isDestroyed()) return;
      api.redrawRows();
    });
    return () => {
      cancelled = true;
    };
  }, [selectedLevel1Id]);

  const level2GridApiRef = useRef<GridApi<MenuItem> | null>(null);
  const handleLevel2GridReady = useCallback((event: GridReadyEvent<MenuItem>) => {
    level2GridApiRef.current = event.api;
  }, []);
  // Level2 redrawRows 게이팅:
  //  - selectedLevel1Id 변경(다른 부모 클릭) → level2Data 자체가 새로 받아져 AG Grid 가
  //    행을 자연 재생성. 이때 redrawRows 를 또 호출하면 React cellRenderer 의 commit 과
  //    충돌해 "removeChild ..." 런타임 에러 재발.
  //  - 같은 부모 내에서 자식 간 이동(editingId 만 변경, selectedLevel1Id 동일) 일 때만
  //    rowData 가 그대로이므로 redrawRows 가 필요하다.
  const prevSelectedLevel1IdRef = useRef(selectedLevel1Id);
  useEffect(() => {
    const sameParent = prevSelectedLevel1IdRef.current === selectedLevel1Id;
    prevSelectedLevel1IdRef.current = selectedLevel1Id;
    if (!sameParent) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const api = level2GridApiRef.current;
      if (!api || api.isDestroyed()) return;
      api.redrawRows();
    });
    return () => {
      cancelled = true;
    };
  }, [editingId, selectedLevel1Id]);

  // 컨텍스트 객체도 memoize — 매 렌더 신규 객체가 AG Grid 로 흘러가는 것을 차단.
  const level1Context = useMemo(
    () => ({ selectedLevel1Id, onLevel1Click, onSortValueChange }),
    [selectedLevel1Id, onLevel1Click, onSortValueChange],
  );
  const level2Context = useMemo(
    () => ({ onLevel2Click, onSortValueChange }),
    [onLevel2Click, onSortValueChange],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
          メニュー目録
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={onDelete}
            disabled={!isDeleteEnabled || isDeleting}
          >
            削除
          </Button>
          <Button variant="outline" onClick={onSortSave} disabled={isSortSaving}>
            整列保存
          </Button>
        </div>
      </div>

      {/* 테이블 2개 (flex-wrap) */}
      <div className="flex flex-wrap gap-[18px]">
        {/* 좌측: 1-Level */}
        <div className="flex-1 min-w-[400px]">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h3 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              1-Level Menu
            </h3>
            <Checkbox
              checked={activeOnly}
              onChange={onActiveFilterChange}
              label="使用可否がYの値のみ表示"
            />
          </div>
          <DataGrid<MenuItem>
            key={`level1-${sortRefreshVersion}`}
            columnDefs={level1Columns}
            rowData={level1Data}
            getRowId={(p) => p.data.id}
            getRowClass={getLevel1RowClass}
            className="menus-grid"
            maxHeight={500}
            context={level1Context}
            onGridReady={handleLevel1GridReady}
          />
        </div>

        {/* 우측: 2-Level */}
        <div className="flex-1 min-w-[400px]">
          <h3 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010] mb-2">
            {selectedLevel1Name ? (
              <>
                [<span className="text-[#e97923]">{selectedLevel1Name}</span>] 2-Level Menu
              </>
            ) : (
              "2-Level Menu"
            )}
          </h3>
          <DataGrid<MenuItem>
            key={`level2-${sortRefreshVersion}`}
            columnDefs={level2Columns}
            rowData={level2Data}
            getRowId={(p) => p.data.id}
            getRowClass={getLevel2RowClass}
            className="menus-grid"
            maxHeight={500}
            context={level2Context}
            onGridReady={handleLevel2GridReady}
          />
        </div>
      </div>
    </div>
  );
}
