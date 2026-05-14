"use client";

import { useMemo } from "react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  DragAndDropModule,
  ModuleRegistry,
  RenderApiModule,
  RowApiModule,
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

// AG Grid v32+ 모듈 분리 정책:
//   - `api.getRowNode()` 는 RowApiModule 에 포함 → codes/permissions 테이블의 더블클릭 수정
//     플로우에서 필수. 누락 시 런타임 error #200 (moduleName=RowApi).
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CellStyleModule,
  RowAutoHeightModule,
  RowStyleModule,
  DragAndDropModule,
  RenderApiModule,
  RowApiModule,
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
  /**
   * true 시 그리드 높이를 행 개수에 맞춰 자동 확장하고 컨테이너 내부 스크롤을 제거한다.
   * maxHeight 보다 우선 — 명시되면 maxHeight 는 무시. 페이지 자체 스크롤을 사용.
   */
  autoHeight?: boolean;
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
  autoHeight = false,
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

  // autoHeight 가 명시되면 maxHeight 무시 — 그리드 자체가 행 수에 맞춰 늘어나고
  // 컨테이너 내부 스크롤이 제거된다. 페이지 스크롤로 위임.
  const useAutoHeight = autoHeight || !maxHeight;

  return (
    <div
      className={`w-full ${className}`}
      style={useAutoHeight ? undefined : { height: maxHeight }}
    >
      <AgGridReact<T>
        theme={customTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout={useAutoHeight ? "autoHeight" : "normal"}
        getRowClass={getRowClass}
        getRowId={getRowId}
        context={context}
        suppressCellFocus
        suppressRowHoverHighlight={false}
        // 셀 텍스트 드래그 선택·복사 허용 (기본은 AG Grid range selection 때문에 막혀 있음)
        //
        // ⚠️ ensureDomOrder 는 의도적으로 비활성화. AG Grid 35 + React 19 환경에서 행
        // 삭제·rowData 교체 시 AG Grid 가 DOM 순서를 강제로 재배치하면서 React fiber
        // 가 추적하던 cellRenderer 의 부모-자식 관계가 깨져 commit phase 에서
        // "removeChild ... not a child of this node" NotFoundError 가 재발한다.
        // 텍스트 선택 시 가상화된 행에서 복사 순서가 어긋날 수 있는 트레이드오프가
        // 있으나, 본 프로젝트의 그리드는 행 수가 적어 가상화 영향이 미미함.
        enableCellTextSelection
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
