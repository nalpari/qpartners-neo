"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import type { ColDef, ICellRendererParams, CellDoubleClickedEvent, CellClickedEvent } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { DetailGridRow } from "./codes-types";

// 편집 불가 필드
const NON_EDITABLE_FIELDS = new Set(["headerCode", "isActive"]);

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function CellInput({
  defaultValue,
  placeholder,
  onChange,
  onKeyDown,
  autoFocus,
}: {
  defaultValue: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
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
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
    />
  );
}

// cell renderer는 파일 스코프 함수로 선언 — 매 렌더 identity가 안정되어 ag-grid 셀 재마운트 방지
// 상태·핸들러는 ag-grid context(`params.context`)를 경유해 주입
function EditableCellRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  const field = params.colDef?.field;
  if (!data || !field) return null;
  const ctx = params.context as {
    newRowFieldsRef: React.RefObject<Record<string, string>>;
    onNewRowFieldChange: (field: string, value: string) => void;
    onEditFieldChange: (field: string, value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  if (data.isNew) {
    return <CellInput defaultValue={ctx.newRowFieldsRef.current[field] ?? ""} placeholder="" onChange={(v) => ctx.onNewRowFieldChange(field, v)} />;
  }
  if (data.editingField === field) {
    return <CellInput defaultValue={String(params.value ?? "")} placeholder="" onChange={(v) => ctx.onEditFieldChange(field, v)} onKeyDown={ctx.onKeyDown} autoFocus />;
  }
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
}

function HeaderCodeCellRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  if (!data) return null;
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerCode}</span>;
}

function ActiveTextRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
}

interface CodesDetailTableProps {
  rows: DetailGridRow[];
  selectedHeaderCode: string;
  hasNewRow: boolean;
  isLoading?: boolean;
  isError?: boolean;
  editingCell: { rowId: string; field: string } | null;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCellEditStart: (rowId: string, field: string) => void;
  onEditCancel: () => void;
  /** H9: 셀 전환 시 미저장 편집이 있으면 확인 다이얼로그 후 취소 */
  onRequestEditCancel: (onConfirm?: () => void) => void;
  onSave?: () => void;
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
  isError,
  editingCell,
  onAdd,
  onCancelAdd,
  onCellEditStart,
  onEditCancel,
  onRequestEditCancel,
  onSave,
  onNewRowFieldChange,
  onEditFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesDetailTableProps) {
  // 키보드 편집 접근성 — Enter 저장 / Escape 취소 (WCAG 2.1.1 Keyboard)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEditCancel();
    }
  }, [onSave, onEditCancel]);

  // ag-grid context로 핸들러 주입 — 파일 스코프 렌더러가 params.context로 접근
  const gridContext = useMemo(() => ({
    newRowFieldsRef,
    onNewRowFieldChange,
    onEditFieldChange,
    onKeyDown: handleKeyDown,
  }), [newRowFieldsRef, onNewRowFieldChange, onEditFieldChange, handleKeyDown]);

  const columnDefs = useMemo<ColDef<DetailGridRow>[]>(() => [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Code", field: "code", flex: 0.8, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Display Code", field: "displayCode", flex: 0.8, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Code Name", field: "codeName", flex: 1.5, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Code Name\n(etc.)", field: "codeNameEtc", flex: 1, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Sort\nOrder", field: "sortOrder", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
  ], []);

  const getRowClass = useCallback((params: RowClassParams<DetailGridRow>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  }, []);

  // 셀 전환 시 미저장 편집값이 있으면 확인 다이얼로그 — onEditCancel() 직접 호출 대신 onRequestEditCancel 사용
  const handleCellClicked = useCallback((event: CellClickedEvent<DetailGridRow>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    onRequestEditCancel();
  }, [editingCell, onRequestEditCancel]);

  const handleCellDoubleClicked = useCallback((event: CellDoubleClickedEvent<DetailGridRow>) => {
    const data = event.data;
    const field = event.colDef.field;
    if (!data || data.isNew || !field) return;
    if (NON_EDITABLE_FIELDS.has(field)) return;
    onCellEditStart(data.id, field);
  }, [onCellEditStart]);

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">Code Detail</h2>
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
      {isError ? (
        <div className="flex items-center justify-center h-[57px] font-['Noto_Sans_JP'] text-[14px] text-[#E97923]">
          データの読み込みに失敗しました。
        </div>
      ) : (
        <DataGrid<DetailGridRow>
          columnDefs={columnDefs}
          rowData={rows}
          getRowClass={getRowClass}
          getRowId={(p) => p.data.id}
          context={gridContext}
          className="codes-detail-grid"
          maxHeight={0}
          loading={isLoading}
          emptyMessage="値がありません"
          onCellDoubleClicked={handleCellDoubleClicked}
          onCellClicked={handleCellClicked}
        />
      )}
    </div>
  );
}
