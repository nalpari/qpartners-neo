"use client";

import { useMemo } from "react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  DragAndDropModule,
  ModuleRegistry,
  RenderApiModule,
  RowAutoHeightModule,
  RowStyleModule,
  themeQuartz,
  type ColDef,
  type RowClassParams,
  type RowDoubleClickedEvent,
  type CellDoubleClickedEvent,
  type CellClickedEvent,
  type GridReadyEvent,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CellStyleModule,
  RowAutoHeightModule,
  RowStyleModule,
  DragAndDropModule,
  RenderApiModule,
]);

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
  maxHeight?: number;
  getRowClass?: (params: RowClassParams<T>) => string | undefined;
  getRowId?: (params: { data: T }) => string;
  context?: Record<string, unknown>;
  loading?: boolean;
  emptyMessage?: string;
  onRowDoubleClicked?: (event: RowDoubleClickedEvent<T>) => void;
  onCellDoubleClicked?: (event: CellDoubleClickedEvent<T>) => void;
  onCellClicked?: (event: CellClickedEvent<T>) => void;
  onGridReady?: (event: GridReadyEvent<T>) => void;
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
  emptyMessage = "データがありません",
  onRowDoubleClicked,
  onCellDoubleClicked,
  onCellClicked,
  onGridReady,
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

  // AG Grid 본체의 noRowsOverlay 안에서 메시지를 표시한다.
  // (sibling div fallback 은 그리드 외부에 추가 row 가 생겨 높이/border 가 어긋났음)
  const noRowsTemplate = useMemo(() => {
    const escaped = emptyMessage
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return `<span class="font-['Noto_Sans_JP'] text-[14px] text-[#AAAAAA]">${escaped}</span>`;
  }, [emptyMessage]);

  return (
    <div
      className={`w-full ${className}`}
      style={maxHeight ? { height: maxHeight } : undefined}
    >
      <AgGridReact<T>
        theme={customTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout={maxHeight ? "normal" : "autoHeight"}
        getRowClass={getRowClass}
        getRowId={getRowId}
        context={context}
        suppressCellFocus
        suppressRowHoverHighlight={false}
        // 셀 텍스트 드래그 선택·복사 허용 (기본은 AG Grid range selection 때문에 막혀 있음)
        // ensureDomOrder 는 드래그 선택 시 DOM 순서와 화면 순서 일치 보장 → 복사 결과가 올바르게 정렬됨
        enableCellTextSelection
        ensureDomOrder
        headerHeight={57}
        rowHeight={57}
        overlayNoRowsTemplate={noRowsTemplate}
        loading={loading}
        onRowDoubleClicked={onRowDoubleClicked}
        onCellDoubleClicked={onCellDoubleClicked}
        onCellClicked={onCellClicked}
        onGridReady={onGridReady}
      />
    </div>
  );
}
