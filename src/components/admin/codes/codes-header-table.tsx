"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import type { ColDef, ICellRendererParams, CellDoubleClickedEvent, CellClickedEvent, GridApi, GridReadyEvent } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { HeaderGridRow } from "./codes-types";

// 편집 불가 필드 — 첫번째 컬럼(headerCode, detail 진입 링크) + 使用可否(isActive)
const NON_EDITABLE_FIELDS = new Set(["headerCode", "isActive"]);

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

// AG Grid 의 셀 키보드 네비게이션이 input 타이핑(화살표/Home/End 등)을 가로채지 않도록
// 편집 가능 컬럼에 적용. input/textarea 가 포커스된 상태에서는 모든 키를 input 이 처리.
function suppressKeyboardWhenEditing(params: { event: KeyboardEvent }) {
  const target = params.event.target as HTMLElement | null;
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

/**
 * 셀 인라인 편집용 input — defaultValue(uncontrolled) + ref 기반 변경 추적으로
 * 부모 setState 재렌더 차단(focus 유지). autoFocus + select 로 진입 시 전체 선택.
 */
function CellInput({
  defaultValue,
  placeholder,
  onChange,
  onKeyDown,
}: {
  defaultValue: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // 화살표/Home/End 등 커서 이동 키는 AG Grid 셀 네비게이션이 가로채지 않도록 차단
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
          e.stopPropagation();
          return;
        }
        onKeyDown?.(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#101010] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none placeholder:text-[#AAAAAA]"
    />
  );
}

// ag-grid context 타입
type HeaderGridContext = {
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  onNewRowFieldChange: (field: string, value: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  onHeaderClick: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

// 첫번째 컬럼 — 신규행은 input, 기존행은 detail 진입 버튼 (편집 불가)
function HeaderCodeRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data) return null;
  const ctx = params.context as HeaderGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.headerCode ?? ""}
        placeholder=""
        onChange={(v) => ctx.onNewRowFieldChange("headerCode", v)}
      />
    );
  }
  return (
    <button
      type="button"
      className="text-[#1060B4] hover:underline cursor-pointer font-['Noto_Sans_JP'] text-[14px]"
      onClick={() => ctx.onHeaderClick(data.id)}
    >
      {data.headerCode}
    </button>
  );
}

// 일반 편집 가능 컬럼 (헤더 텍스트 필드)
function EditableTextRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  const field = params.colDef?.field;
  if (!data || !field) return null;
  const ctx = params.context as HeaderGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current[field] ?? ""}
        placeholder=""
        onChange={(v) => ctx.onNewRowFieldChange(field, v)}
      />
    );
  }
  if (data.editingField === field) {
    return (
      <CellInput
        defaultValue={String(params.value ?? "")}
        placeholder=""
        onChange={(v) => ctx.onEditFieldChange(field, v)}
        onKeyDown={ctx.onKeyDown}
      />
    );
  }
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
}

function ActiveTextRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
}

interface CodesHeaderTableProps {
  rows: HeaderGridRow[];
  hasNewRow: boolean;
  isLoading?: boolean;
  editingCell: { rowId: string; field: string } | null;
  onAdd: () => void;
  onCancelAdd: () => void;
  onSave: () => void;
  isSaving?: boolean;
  onHeaderClick: (id: string) => void;
  onCellEditStart: (rowId: string, field: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  onEditCancel: () => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CodesHeaderTable({
  rows,
  hasNewRow,
  isLoading,
  editingCell,
  onAdd,
  onCancelAdd,
  onSave,
  isSaving,
  onHeaderClick,
  onCellEditStart,
  onEditFieldChange,
  onEditCancel,
  onNewRowFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesHeaderTableProps) {
  // AG Grid API ref + editingCell 변화 시 강제 cell refresh
  // (data 객체에 editingField 가 추가/제거되어도 셀 value 자체는 변하지 않아
  //  AG Grid 가 자동 refresh 하지 않으므로 수동 트리거 필요)
  const apiRef = useRef<GridApi<HeaderGridRow> | null>(null);
  const prevEditingRowIdRef = useRef<string | null>(null);
  const handleGridReady = useCallback((event: GridReadyEvent<HeaderGridRow>) => {
    apiRef.current = event.api;
  }, []);
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    // 편집 셀 전환 시 이전 행 + 현재 행만 refresh — 전체 그리드 재렌더 회피
    const ids = new Set<string>();
    if (prevEditingRowIdRef.current) ids.add(prevEditingRowIdRef.current);
    if (editingCell?.rowId) ids.add(editingCell.rowId);
    const rowNodes = Array.from(ids)
      .map((id) => api.getRowNode(id))
      .filter((node): node is NonNullable<typeof node> => node != null);
    if (rowNodes.length) api.refreshCells({ rowNodes, force: true });
    prevEditingRowIdRef.current = editingCell?.rowId ?? null;
  }, [editingCell]);

  // 키보드 — Enter 저장 / Escape 취소
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEditCancel();
    }
  }, [onSave, onEditCancel]);

  const gridContext = useMemo<HeaderGridContext>(() => ({
    newRowFieldsRef,
    onNewRowFieldChange,
    onEditFieldChange,
    onHeaderClick,
    onKeyDown: handleKeyDown,
  }), [newRowFieldsRef, onNewRowFieldChange, onEditFieldChange, onHeaderClick, handleKeyDown]);

  const columnDefs = useMemo<ColDef<HeaderGridRow>[]>(() => [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Header Id", field: "headerAlias", flex: 1, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Header Code Name", field: "headerName", flex: 1.5, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode3", field: "relCode3", flex: 0.6, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nNum2", field: "relNum2", flex: 0.6, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nNum3", field: "relNum3", flex: 0.6, cellRenderer: EditableTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
  ], []);

  const getRowClass = useCallback((params: RowClassParams<HeaderGridRow>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  }, []);

  // 편집 중 외부 클릭 → 즉시 취소·복원
  const handleCellClicked = useCallback((event: CellClickedEvent<HeaderGridRow>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    onEditCancel();
  }, [editingCell, onEditCancel]);

  const handleCellDoubleClicked = useCallback((event: CellDoubleClickedEvent<HeaderGridRow>) => {
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
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">Header Code</h2>
          <Checkbox checked={activeOnly} onChange={onActiveOnlyChange} label="使用可否がYの値のみ表示" />
        </div>
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={onCancelAdd}>キャンセル</Button>
          ) : (
            <Button variant="outline" onClick={onAdd}>追加</Button>
          )}
          <Button variant="primary" onClick={onSave} disabled={isSaving}>保存</Button>
        </div>
      </div>
      <DataGrid<HeaderGridRow>
        columnDefs={columnDefs}
        rowData={rows}
        getRowClass={getRowClass}
        getRowId={(p) => p.data.id}
        context={gridContext}
        className="codes-header-grid"
        maxHeight={500}
        loading={isLoading}
        onCellDoubleClicked={handleCellDoubleClicked}
        onCellClicked={handleCellClicked}
        onGridReady={handleGridReady}
      />
    </div>
  );
}
