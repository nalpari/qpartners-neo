"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  DragAndDropModule,
  ModuleRegistry,
  RowAutoHeightModule,
  RowStyleModule,
  themeQuartz,
  type ColDef,
  type RowClassParams,
  type RowDoubleClickedEvent,
  type CellDoubleClickedEvent,
  type CellClickedEvent,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule, RowAutoHeightModule, RowStyleModule, DragAndDropModule]);

const customTheme = themeQuartz.withParams({
  backgroundColor: "transparent",
  foregroundColor: "#45576f",
  headerBackgroundColor: "#506273",
  headerFontFamily: "'Noto Sans JP', sans-serif",
  headerFontWeight: 600,
  headerFontSize: 14,
  headerTextColor: "#f5f5f5",
  fontFamily: "'Noto Sans JP', sans-serif",
  fontSize: 14,
  rowBorder: { color: "#e6eef6", width: 1, style: "solid" },
  columnBorder: false,
  headerColumnBorder: false,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  headerHeight: 57,
  rowHeight: 57,
  spacing: 0,
  cellHorizontalPadding: 18,
  headerCellHoverBackgroundColor: "#506273",
  headerColumnResizeHandleWidth: 1,
  headerColumnResizeHandleHeight: "14px",
  headerColumnResizeHandleColor: "rgba(255, 255, 255, 0.3)",
});

interface DataGridProps<T> {
  columnDefs: ColDef<T>[];
  rowData: T[];
  className?: string;
  /** autoHeight 모드에서 wrapper에 적용할 최대 높이 (px). 초과 시 스크롤 */
  maxHeight?: number;
  getRowClass?: (params: RowClassParams<T>) => string | undefined;
  getRowId?: (params: { data: T }) => string;
  context?: Record<string, unknown>;
  loading?: boolean;
  emptyMessage?: ReactNode;
  onRowDoubleClicked?: (event: RowDoubleClickedEvent<T>) => void;
  onCellDoubleClicked?: (event: CellDoubleClickedEvent<T>) => void;
  onCellClicked?: (event: CellClickedEvent<T>) => void;
}

const DEFAULT_MAX_HEIGHT = 500;

export function DataGrid<T>({
  columnDefs,
  rowData,
  className = "",
  maxHeight = DEFAULT_MAX_HEIGHT,
  getRowClass: externalGetRowClass,
  getRowId,
  context,
  loading,
  emptyMessage,
  onRowDoubleClicked,
  onCellDoubleClicked,
  onCellClicked,
}: DataGridProps<T>) {
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: false,
      filter: false,
      resizable: true,
      suppressMovable: false,
      cellStyle: { display: "flex", alignItems: "center" },
    }),
    [],
  );

  const getRowClass = (params: RowClassParams<T>) => {
    if (externalGetRowClass) {
      const cls = externalGetRowClass(params);
      if (cls) return cls;
    }
    return params.node.rowIndex !== null && params.node.rowIndex % 2 !== 0
      ? "ag-row-striped"
      : undefined;
  };

  return (
    <div
      className={`w-full overflow-y-auto ${className}`}
      style={{ maxHeight }}
    >
      <AgGridReact<T>
        theme={customTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout="autoHeight"
        getRowClass={getRowClass}
        getRowId={getRowId}
        context={context}
        suppressCellFocus
        suppressRowHoverHighlight={false}
        headerHeight={57}
        rowHeight={57}
        suppressNoRowsOverlay={!!emptyMessage}
        loading={loading}
        onRowDoubleClicked={onRowDoubleClicked}
        onCellDoubleClicked={onCellDoubleClicked}
        onCellClicked={onCellClicked}
      />
      {emptyMessage && rowData.length === 0 && !loading && (
        <div className="flex items-center justify-center h-[57px] border-b border-[#E6EEF6] font-['Noto_Sans_JP'] text-[14px] text-[#AAAAAA]">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
