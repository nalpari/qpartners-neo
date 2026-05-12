"use client";

import { useMemo, useCallback, useRef, useEffect } from "react";
import type { ColDef, ICellRendererParams, GridApi, GridReadyEvent, CellClassParams } from "ag-grid-community";
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
  editingId?: string | null;
  onLevel1Click?: (id: string) => void;
  onLevel2Click?: (id: string) => void;
  onSortValueChange?: (id: string, v: number) => void;
  // RBAC — sort input cell renderer 가 매트릭스 가드 적용 시 readonly 처리하도록 context 로 전달.
  // canUpdate=false 거나 isPermLoading 시 input 비활성 (타이핑 차단).
  isSortReadOnly?: boolean;
}

function toCtx(context: unknown): MenusGridContext {
  return (context ?? {}) as MenusGridContext;
}

// cell 단위 하이라이트 — context 의 매칭 id 와 같으면 selected class 부여.
// row 전체에 클래스를 주는 getRowClass + redrawRows 조합은 React 19 와 충돌하므로,
// 모든 cell 에 같은 클래스를 부여해 행 전체처럼 보이게 한다 (CSS 는 background-color).
function level1SelectedCellClass(params: CellClassParams<MenuItem>): string | undefined {
  const ctx = toCtx(params.context);
  return ctx.selectedLevel1Id && params.data?.id === ctx.selectedLevel1Id
    ? "ag-cell-selected-menu"
    : undefined;
}

function level2SelectedCellClass(params: CellClassParams<MenuItem>): string | undefined {
  const ctx = toCtx(params.context);
  return ctx.editingId && params.data?.id === ctx.editingId
    ? "ag-cell-selected-menu"
    : undefined;
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
      // RBAC 패턴 C — canUpdate=false 시 sort input 비활성. 타이핑 자체 차단으로
      // 整列保存 버튼 disabled 와 이중 가드 (값 변경 → ref 누적 후 저장 시도 우회 방지).
      disabled={ctx.isSortReadOnly}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const val = Number(e.target.value);
        if (Number.isInteger(val) && val >= 1) ctx.onSortValueChange?.(data.id, val);
      }}
      className="w-[60px] h-[38px] px-2 text-center bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] outline-none focus:border-[#101010] sort-input-no-spinner disabled:bg-[#f5f5f5] disabled:text-[#999]"
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
  // RBAC — sort 액션은 update 권한. 부모(MenusContents) 단일 호출 후 prop 으로 전달.
  canUpdate: boolean;
  isPermLoading: boolean;
}

export function MenusTables({
  canUpdate,
  isPermLoading,
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
      cellClass: level1SelectedCellClass,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "使用可否",
      field: "isActive",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellClass: level1SelectedCellClass,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "モバイル",
      field: "showInMobile",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellClass: level1SelectedCellClass,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Top",
      field: "showInTopNav",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellClass: level1SelectedCellClass,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Sort",
      field: "sortOrder",
      flex: 0.6,
      cellRenderer: SortCellRenderer,
      cellClass: level1SelectedCellClass,
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
      cellClass: level2SelectedCellClass,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "使用可否",
      field: "isActive",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellClass: level2SelectedCellClass,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "モバイル",
      field: "showInMobile",
      flex: 0.6,
      cellRenderer: TextRenderer,
      cellClass: level2SelectedCellClass,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Sort",
      field: "sortOrder",
      flex: 0.6,
      cellRenderer: SortCellRenderer,
      cellClass: level2SelectedCellClass,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: () => true,
    },
  ], []);

  // --- 선택 하이라이트 갱신 ---
  //
  // cellClass 콜백은 행 생성 시점에 한 번만 평가되고 context 변경 만으로는 자동
  // 재평가되지 않는다. selectedLevel1Id / editingId 가 바뀌면 refreshCells 로
  // cell 단위 재평가만 트리거 — row destroy 가 일어나지 않아 React 19 commit phase
  // 와 충돌하지 않는다 (홈 공지 패턴 참고).
  const level1GridApiRef = useRef<GridApi<MenuItem> | null>(null);
  const handleLevel1GridReady = useCallback((event: GridReadyEvent<MenuItem>) => {
    level1GridApiRef.current = event.api;
  }, []);
  useEffect(() => {
    const api = level1GridApiRef.current;
    if (!api || api.isDestroyed()) return;
    api.refreshCells({ force: true });
  }, [selectedLevel1Id]);

  const level2GridApiRef = useRef<GridApi<MenuItem> | null>(null);
  const handleLevel2GridReady = useCallback((event: GridReadyEvent<MenuItem>) => {
    level2GridApiRef.current = event.api;
  }, []);
  useEffect(() => {
    const api = level2GridApiRef.current;
    if (!api || api.isDestroyed()) return;
    api.refreshCells({ force: true });
  }, [editingId]);

  // RBAC — sort input 의 readonly 판정값. canUpdate=false 거나 로딩 중이면 input 비활성.
  const isSortReadOnly = isPermLoading || !canUpdate;

  // 컨텍스트 객체도 memoize — 매 렌더 신규 객체가 AG Grid 로 흘러가는 것을 차단.
  const level1Context = useMemo(
    () => ({ selectedLevel1Id, onLevel1Click, onSortValueChange, isSortReadOnly }),
    [selectedLevel1Id, onLevel1Click, onSortValueChange, isSortReadOnly],
  );
  const level2Context = useMemo(
    () => ({ editingId, onLevel2Click, onSortValueChange, isSortReadOnly }),
    [editingId, onLevel2Click, onSortValueChange, isSortReadOnly],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
          メニュー目録
        </h2>
        <div className="flex items-center gap-2">
          {/* 整列保存 — RBAC 패턴 A (canUpdate=false 시 미노출). #2183 note-12 통일 */}
          {!isPermLoading && canUpdate && (
            <Button
              variant="outline"
              onClick={onSortSave}
              disabled={isSortSaving}
            >
              整列保存
            </Button>
          )}
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
