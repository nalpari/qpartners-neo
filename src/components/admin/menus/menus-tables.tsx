"use client";

import { useMemo } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { MenuItem } from "./menus-dummy-data";

// Design Ref: §5.3 — 1-Level + 2-Level 테이블

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

interface MenusTablesProps {
  level1Data: MenuItem[];
  level2Data: MenuItem[];
  selectedLevel1Id: string | null;
  selectedLevel1Name: string;
  activeOnly: boolean;
  onActiveFilterChange: (checked: boolean) => void;
  onLevel1Click: (id: string) => void;
  onSortSave: () => void;
}

export function MenusTables({
  level1Data,
  level2Data,
  selectedLevel1Id,
  selectedLevel1Name,
  activeOnly,
  onActiveFilterChange,
  onLevel1Click,
  onSortSave,
}: MenusTablesProps) {

  // --- Cell Renderers ---

  function MenuNameRenderer(params: ICellRendererParams<MenuItem>) {
    const data = params.data;
    if (!data) return null;
    return (
      <button
        type="button"
        className="text-[#1060B4] hover:underline cursor-pointer font-['Noto_Sans_JP'] text-[14px] text-left"
        onClick={() => onLevel1Click(data.id)}
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
    return (
      <input
        type="number"
        min={1}
        defaultValue={data.sortOrder}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[60px] h-[38px] px-2 text-center bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] outline-none focus:border-[#101010] sort-input-no-spinner"
      />
    );
  }

  // --- Column Defs ---

  const level1Columns = useMemo<ColDef<MenuItem>[]>(
    () => [
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const level2Columns = useMemo<ColDef<MenuItem>[]>(
    () => [
      {
        headerName: "Menu Name",
        field: "menuName",
        flex: 2,
        cellRenderer: TextRenderer,
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
    ],
    []
  );

  // --- Row Class (선택 하이라이트) ---

  const getLevel1RowClass = (params: RowClassParams<MenuItem>) => {
    if (params.data?.id === selectedLevel1Id) return "ag-row-selected-menu";
    return undefined;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
          メニュー目録
        </h2>
        <Button variant="outline" onClick={onSortSave}>
          整列保存
        </Button>
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
            columnDefs={level1Columns}
            rowData={level1Data}
            getRowClass={getLevel1RowClass}
            className="menus-grid"
            maxHeight={0}
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
            columnDefs={level2Columns}
            rowData={level2Data}
            className="menus-grid"
            maxHeight={0}
          />
        </div>
      </div>
    </div>
  );
}
