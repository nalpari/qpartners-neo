"use client";

import { useMemo } from "react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  DragAndDropModule,
  ModuleRegistry,
  RowStyleModule,
  themeQuartz,
  type ColDef,
  type RowClassParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule, RowStyleModule, DragAndDropModule]);

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
  headerColumnResizeHandleDisplay: "block",
  headerColumnResizeHandleWidth: 1,
  headerColumnResizeHandleHeight: "14px",
  headerColumnResizeHandleColor: "rgba(255, 255, 255, 0.3)",
});

interface DataGridProps<T> {
  columnDefs: ColDef<T>[];
  rowData: T[];
  className?: string;
}

export function DataGrid<T>({
  columnDefs,
  rowData,
  className = "",
}: DataGridProps<T>) {
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: false,
      filter: false,
      resizable: true,
      suppressMovable: false,
      cellStyle: { display: "flex", alignItems: "center" },
    }),
    []
  );

  const getRowClass = (params: RowClassParams<T>) => {
    return params.node.rowIndex !== null && params.node.rowIndex % 2 !== 0
      ? "ag-row-striped"
      : undefined;
  };

  return (
    <div className={`w-full ${className}`}>
      <AgGridReact<T>
        theme={customTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout="autoHeight"
        getRowClass={getRowClass}
        suppressCellFocus
        suppressRowHoverHighlight={false}
        headerHeight={57}
        rowHeight={57}
      />
    </div>
  );
}
