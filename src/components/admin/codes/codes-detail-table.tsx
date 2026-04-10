"use client";

import { useEffect, useRef } from "react";
import type { ColDef, ICellRendererParams, CellDoubleClickedEvent, CellClickedEvent } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { DetailGridRow } from "./codes-contents";

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function CellInput({
  defaultValue,
  placeholder,
  onChange,
  autoFocus,
}: {
  defaultValue: string;
  placeholder: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
    />
  );
}

interface CodesDetailTableProps {
  rows: DetailGridRow[];
  selectedHeaderCode: string;
  hasNewRow: boolean;
  isLoading?: boolean;
  editingCell: { rowId: string; field: string } | null;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCellEditStart: (rowId: string, field: string) => void;
  onEditCancel: () => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CodesDetailTable({
  rows,
  selectedHeaderCode,
  hasNewRow,
  isLoading,
  editingCell,
  onAdd,
  onCancelAdd,
  onCellEditStart,
  onEditCancel,
  onNewRowFieldChange,
  onEditFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesDetailTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Cell Renderers ---

  // headerCode 컬럼은 편집 불가 (항상 span)
  function HeaderCodeCellRenderer(params: ICellRendererParams<DetailGridRow>) {
    const data = params.data;
    if (!data) return null;
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerCode}</span>;
  }

  function EditableCellRenderer(field: string) {
    return function Renderer(params: ICellRendererParams<DetailGridRow>) {
      const data = params.data;
      if (!data) return null;
      // 신규행 → 항상 입력
      if (data.isNew) {
        return (
          <CellInput
            defaultValue={newRowFieldsRef.current[field] ?? ""}
            placeholder=""
            onChange={(v) => onNewRowFieldChange(field, v)}
          />
        );
      }
      // 더블클릭된 특정 셀만 편집 모드
      if (data.editingField === field) {
        return (
          <CellInput
            defaultValue={String(params.value ?? "")}
            placeholder=""
            onChange={(v) => onEditFieldChange(field, v)}
            autoFocus
          />
        );
      }
      return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
    };
  }

  function ActiveTextRenderer(params: ICellRendererParams<DetailGridRow>) {
    const data = params.data;
    if (!data || data.isNew) return null;
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
  }

  const columnDefs: ColDef<DetailGridRow>[] = [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeCellRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Code", field: "code", flex: 0.8, cellRenderer: EditableCellRenderer("code"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Display Code", field: "displayCode", flex: 0.8, cellRenderer: EditableCellRenderer("displayCode"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Code Name", field: "codeName", flex: 1.5, cellRenderer: EditableCellRenderer("codeName"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Code Name\n(etc.)", field: "codeNameEtc", flex: 1, cellRenderer: EditableCellRenderer("codeNameEtc"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: EditableCellRenderer("relCode1"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: EditableCellRenderer("relCode2"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: EditableCellRenderer("relNum1"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Sort\nOrder", field: "sortOrder", flex: 0.6, cellRenderer: EditableCellRenderer("sortOrder"), cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
  ];

  const getRowClass = (params: RowClassParams<DetailGridRow>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  };

  // 다른 셀 클릭 시 편집 해제
  const handleCellClicked = (event: CellClickedEvent<DetailGridRow>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    onEditCancel();
  };

  // 더블클릭 → 해당 셀만 편집 모드
  const handleCellDoubleClicked = (event: CellDoubleClickedEvent<DetailGridRow>) => {
    const data = event.data;
    const field = event.colDef.field;
    if (!data || data.isNew || !field) return;
    // headerCode, isActive는 편집 불가
    if (field === "headerCode" || field === "isActive") return;
    onCellEditStart(data.id, field);
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
            Code Detail
          </h2>
          <Checkbox checked={activeOnly} onChange={onActiveOnlyChange} label="使用可否がYの値のみ表示" />
        </div>
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={onCancelAdd}>キャンセル</Button>
          ) : (
            <Button variant="outline" onClick={onAdd} disabled={!selectedHeaderCode}>追加</Button>
          )}
        </div>
      </div>
      <DataGrid<DetailGridRow>
        columnDefs={columnDefs}
        rowData={rows}
        getRowClass={getRowClass}
        className="codes-detail-grid"
        maxHeight={0}
        loading={isLoading}
        onCellDoubleClicked={handleCellDoubleClicked}
        onCellClicked={handleCellClicked}
      />
    </div>
  );
}
